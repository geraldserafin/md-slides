-- | Implementacja algorytmu GumTree (Falleri et al., 2014) do liczenia
-- mapowania węzłów między dwoma drzewami. Moduł jest agnostyczny względem
-- źródła drzewa (tree-sitter, JSON, cokolwiek) — operuje wyłącznie na
-- własnym, generycznym typie 'Tree'. Osoba wołająca ('Main') odpowiada
-- za zmapowanie swojej reprezentacji węzła (np. 'TreeSitter.Node') na 'Tree'.
module GumTree
  ( Tree (..)
  , Matching
  , match
  , flatten
  , height
  , Edit (..)
  , editScript
  , collapseEdits
  ) where

import qualified Data.Map.Strict as Map
import qualified Data.Set as Set
import Data.List (maximumBy, sortOn)
import Data.Ord (comparing)
import Data.Hashable (hash)
import Data.Word (Word32)

-- | Generyczne drzewo do diffowania. 'treeId' musi być unikalne w obrębie
-- JEDNEGO drzewa (nie musi być unikalne między dwoma drzewami, które
-- porównujesz — każde ma swoją niezależną numerację).
--
-- 'treeStart'/'treeEnd' (byte range w oryginalnym źródle) są głównie
-- metadaną, przydatną np. do odwzorowania wyniku 'match' na konkretne
-- fragmenty tekstu. 'treeText' jest używany w hashu (patrz 'subtreeHash')
-- -- bez tego np. 'cartItems.length' i 'cartItems.reduce' są strukturalnie
-- nie do odróżnienia (oba to member_expression[identifier,.,property_identifier]).
-- Ma sens tylko dla LIŚCI (puste dla kontenerów -- ich treść bierze się
-- rekurencyjnie z hashów dzieci, nie trzeba jej dublować).
data Tree = Tree
  { treeId       :: Int
  , treeLabel    :: String
  , treeText     :: String
  , treeStart    :: Word32
  , treeEnd      :: Word32
  , treeChildren :: [Tree]
  } deriving Show

-- | treeId z t1 -> treeId z t2
type Matching = Map.Map Int Int

flatten :: Tree -> [Tree]
flatten t = t : concatMap flatten (treeChildren t)

postOrder :: Tree -> [Tree]
postOrder t = concatMap postOrder (treeChildren t) ++ [t]

height :: Tree -> Int
height t
  | null (treeChildren t) = 0
  | otherwise = 1 + maximum (map height (treeChildren t))

subtreeHash :: Tree -> Int
subtreeHash t
  | null (treeChildren t) = hash (treeLabel t, treeText t)
  | otherwise              = hash (treeLabel t, map subtreeHash (treeChildren t))


-- Faza 3: edit script z gotowego Matching -------------------------------

-- | Pojedyncza operacja. 'Tree' tutaj niesie cały (pod)węzeł, nie tylko id —
-- strona wołająca ma od razu 'treeLabel'/'treeStart'/'treeEnd' do wypisania.
--
-- UWAGA: 'Tree' nie niesie tekstu źródłowego, tylko typ węzła (grammar type)
-- i byte range. 'Update' złapie zmianę TYPU (np. literału 'number' -> 'string',
-- bo to osobne typy węzłów w gramatyce), ale NIE złapie samej zmiany np. nazwy
-- zmiennej (typ 'identifier' zostaje ten sam w obu wersjach) — to jest
-- świadome uproszczenie, zgodne z tym że 'match' też jest tekstowo-ślepy.
-- Strona wołająca, mając dostęp do oryginalnego źródła, może to doprecyzować
-- samodzielnie porównując tekst pod 'treeStart'/'treeEnd' dla par bez 'Update'.
data Edit
  = Insert Tree          -- ^ nowy węzeł, był tylko w drugim drzewie
  | Delete Tree          -- ^ usunięty węzeł, był tylko w pierwszym drzewie
  | Update Tree Tree     -- ^ zmatchowana para, ale inny typ węzła
  | Move Tree Tree       -- ^ zmatchowana para, ale inny rodzic
  deriving Show

editScript :: Tree -> Tree -> Matching -> [Edit]
editScript root1 root2 matching =
  deletions ++ insertions ++ concatMap diffPair (Map.toList matching)
  where
    byId1 = Map.fromList [ (treeId t, t) | t <- flatten root1 ]
    byId2 = Map.fromList [ (treeId t, t) | t <- flatten root2 ]

    matchedIds2 = Map.elems matching

    deletions  = [ Delete t | t <- flatten root1, not (treeId t `Map.member` matching) ]
    insertions = [ Insert t | t <- flatten root2, not (treeId t `elem` matchedIds2) ]

    parents1 = parentMap root1
    parents2 = parentMap root2

    diffPair (id1, id2) =
      case (Map.lookup id1 byId1, Map.lookup id2 byId2) of
        (Just n1, Just n2) -> updateEdit n1 n2 ++ moveEdit id1 id2 n1 n2
        _                  -> []

    updateEdit n1 n2
      | treeLabel n1 /= treeLabel n2 = [Update n1 n2]
      | otherwise                    = []

    moveEdit id1 id2 n1 n2 =
      case (Map.lookup id1 parents1, Map.lookup id2 parents2) of
        (Just p1, Just p2) | Map.lookup p1 matching /= Just p2 -> [Move n1 n2]
        _ -> []

-- childId -> parentId
parentMap :: Tree -> Map.Map Int Int
parentMap root = Map.fromList
  [ (treeId c, treeId t) | t <- flatten root, c <- treeChildren t ]

-- | Edit script z 'editScript' jest kompletny, ale szczegółowy — nowe/usunięte
-- poddrzewo generuje jeden 'Insert'/'Delete' NA WĘZEŁ, nie jeden na całe
-- poddrzewo. 'collapseEdits' zostawia tylko "korzeń" maksymalnego nowego/
-- usuniętego fragmentu (węzeł, którego rodzic NIE jest też Insert/Delete) —
-- resztę (jego potomków) wycina, bo są nią w pełni opisani.
collapseEdits :: Tree -> Tree -> [Edit] -> [Edit]
collapseEdits root1 root2 edits = filter keep edits
  where
    parents1 = parentMap root1
    parents2 = parentMap root2

    insertedIds2 = Set.fromList [ treeId t | Insert t <- edits ]
    deletedIds1  = Set.fromList [ treeId t | Delete t <- edits ]

    keep (Insert t) = maybe True (`Set.notMember` insertedIds2) (Map.lookup (treeId t) parents2)
    keep (Delete t) = maybe True (`Set.notMember` deletedIds1)  (Map.lookup (treeId t) parents1)
    keep _          = True
-- | GumTree (Falleri et al., 2014) + dodatkowe sygnały: tekst nośnych liści
-- ('textSim'), pozycja w pliku, "slot" (identyczna ścieżka od korzenia) i
-- przebieg relokacji dla fragmentów, które się przeniosły.
match :: Tree -> Tree -> Matching
match root1 root2 = leafPass root1 root2 (rootFix afterSecond)
  where
    ctx = mkCtx root1 root2
    afterTop    = topDownMatch ctx root1 root2
    afterFirst  = bottomUpMatch ctx root1 root2 afterTop
    afterReloc  = relocate ctx root1 root2 afterFirst
    afterSecond = bottomUpMatch ctx root1 root2 afterReloc
    rootFix m
      | treeId root1 `Map.member` m = m
      | treeLabel root1 == treeLabel root2 =
          recover ctx (Map.insert (treeId root1) (treeId root2) m) root1 root2
      | otherwise = m

-- | Kontekst z precomputowanymi ścieżkami ("slotami") węzłów obu drzew.
data Ctx = Ctx
  { sameSlot :: Tree -> Tree -> Bool
  , posDist  :: Tree -> Tree -> Double
  }

mkCtx :: Tree -> Tree -> Ctx
mkCtx root1 root2 = Ctx slotEq dist
  where
    paths root = Map.fromList (go [] root)
      where go p t = (treeId t, p) : concat
                       [ go (p ++ [(treeLabel c, i)]) c | (i, c) <- zip [0 :: Int ..] (treeChildren t) ]
    p1 = paths root1
    p2 = paths root2
    slotEq a b = case (Map.lookup (treeId a) p1, Map.lookup (treeId b) p2) of
      (Just x, Just y) -> x == y
      _ -> False
    end1 = max 1 (fromIntegral (treeEnd root1)) :: Double
    end2 = max 1 (fromIntegral (treeEnd root2)) :: Double
    dist a b = abs (fromIntegral (treeStart a) / end1 - fromIntegral (treeStart b) / end2)

minHeight :: Int
minHeight = 2

minDice :: Double
minDice = 0.5

maxSize :: Int
maxSize = 100

-- Faza 1 ----------------------------------------------------------------

heightMap :: Tree -> Map.Map Int Int
heightMap root = Map.fromList [ (treeId t, height t) | t <- flatten root ]

isoEq :: Tree -> Tree -> Bool
isoEq a b =
  treeLabel a == treeLabel b
  && (not (null (treeChildren a)) || treeText a == treeText b)
  && length (treeChildren a) == length (treeChildren b)
  && and (zipWith isoEq (treeChildren a) (treeChildren b))

topDownMatch :: Ctx -> Tree -> Tree -> Matching
topDownMatch ctx root1 root2 = finish (loop [root1] [root2] Map.empty [])
  where
    hs1 = heightMap root1
    hs2 = heightMap root2
    h1 t = Map.findWithDefault 0 (treeId t) hs1
    h2 t = Map.findWithDefault 0 (treeId t) hs2
    maxH hf = foldl' (\a t -> max a (hf t)) (-1)

    loop l1 l2 m amb
      | min mh1 mh2 < minHeight = (m, amb)
      | mh1 > mh2 = loop (expand h1 mh1 l1) l2 m amb
      | mh2 > mh1 = loop l1 (expand h2 mh2 l2) m amb
      | otherwise =
          let top1 = [ t | t <- l1, h1 t == mh1 ]
              top2 = [ t | t <- l2, h2 t == mh2 ]
              rest1 = [ t | t <- l1, h1 t /= mh1 ]
              rest2 = [ t | t <- l2, h2 t /= mh2 ]
              partners a = [ b | b <- top2, subtreeHash a == subtreeHash b, isoEq a b ]
              partnersR b = [ a | a <- top1, subtreeHash a == subtreeHash b, isoEq a b ]
              uniq  = [ (a, b) | a <- top1, [b] <- [partners a], [_] <- [partnersR b], slotAgrees a b ]
              ambPs = [ (a, b) | a <- top1, b <- partners a
                               , length (partners a) > 1 || length (partnersR b) > 1 ]
              usedA = Set.fromList (map (treeId . fst) (uniq ++ ambPs))
              usedB = Set.fromList (map (treeId . snd) (uniq ++ ambPs))
              open1 = [ t | t <- top1, treeId t `Set.notMember` usedA ]
              open2 = [ t | t <- top2, treeId t `Set.notMember` usedB ]
              m' = foldl' (\acc (a, b) -> matchWhole acc a b) m uniq
          in loop (rest1 ++ concatMap treeChildren open1)
                  (rest2 ++ concatMap treeChildren open2)
                  m' (amb ++ ambPs)
      where mh1 = maxH h1 l1
            mh2 = maxH h2 l2

    -- Para izomorficzna w INNYM slocie, gdy a ma w t2 własnego slotowego partnera tego samego typu (np. ciało funkcji vs identyczny blok zagnieżdżony w nowym `try`) -- odłożona do Fazy 2.
    slotAgrees a b = sameSlot ctx a b || null [ () | b' <- nodes2, treeId b' /= treeId b, treeLabel b' == treeLabel a, sameSlot ctx a b' ]
    nodes2 = flatten root2

    expand hf mh l = [ t | t <- l, hf t /= mh ] ++ concatMap treeChildren [ t | t <- l, hf t == mh ]

    parents1 = parentMap root1
    parents2 = parentMap root2
    byId1 = Map.fromList [ (treeId t, t) | t <- flatten root1 ]
    byId2 = Map.fromList [ (treeId t, t) | t <- flatten root2 ]

    finish (m, amb) = foldl' resolve m ranked
      where
        parentDice (a, b) =
          case ( Map.lookup (treeId a) parents1 >>= (`Map.lookup` byId1)
               , Map.lookup (treeId b) parents2 >>= (`Map.lookup` byId2) ) of
            (Just p1, Just p2) -> dice m p1 p2
            _ -> 0
        ranked = sortOn (\p@(a, b) -> (negate (parentDice p), treeId a, treeId b)) amb
        resolve mm (a, b)
          | treeId a `Map.member` mm = mm
          | treeId b `elem` Map.elems mm = mm
          | otherwise = matchWhole mm a b

matchWhole :: Matching -> Tree -> Tree -> Matching
matchWhole matching t1 t2 =
  foldl' (\m (c1, c2) -> matchWhole m c1 c2)
         (Map.insert (treeId t1) (treeId t2) matching)
         (zip (treeChildren t1) (treeChildren t2))

-- Faza 2 ------------------------------------------------------------------

dice :: Matching -> Tree -> Tree -> Double
dice matching n1 n2
  | denom == 0 = 0
  | otherwise  = 2 * fromIntegral common / fromIntegral denom
  where
    d1     = flatten n1
    ids2   = Set.fromList (map treeId (flatten n2))
    common = length [ () | t <- d1, Just m <- [Map.lookup (treeId t) matching], m `Set.member` ids2 ]
    denom  = length d1 + length (flatten n2)

bottomUpMatch :: Ctx -> Tree -> Tree -> Matching -> Matching
bottomUpMatch ctx root1 root2 matching0 =
  foldl' step matching0 [ t | t <- postOrder root1, not (null (treeChildren t)) ]
  where
    nodes1 = [ t | t <- flatten root1, not (null (treeChildren t)) ]
    nodes2 = [ t | t <- flatten root2, not (null (treeChildren t)) ]

    -- Luźniejsza bramka dla pary w tym samym "slocie" (ta sama ścieżka od korzenia).
    slotOk m a b = sameSlot ctx a b && dice m a b >= 0.15 && textSim a b >= 0.3
    strictOk m a b = dice m a b > 0 && dice m a b >= minDice && textSim a b >= minTextSim
    ok m a b = strictOk m a b || slotOk m a b

    step m n1
      | treeId n1 `Map.member` m = m
      | otherwise =
          let used = Set.fromList (Map.elems m)
              free1 = [ t | t <- nodes1, not (treeId t `Map.member` m), treeId t /= treeId n1 ]
              -- n2 zarezerwowany dla "slotowego" partnera, który jeszcze czeka
              reserved n2 = not (sameSlot ctx n1 n2)
                            && any (\t -> treeLabel t == treeLabel n2 && sameSlot ctx t n2 && slotOk m t n2) free1
              scored = [ (score, n2) | n2 <- nodes2
                                     , treeLabel n2 == treeLabel n1
                                     , treeId n2 `Set.notMember` used
                                     , ok m n1 n2
                                     , not (reserved n2)
                                     , let score = dice m n1 n2 + textSim n1 n2
                                                   + (if sameSlot ctx n1 n2 then 0.5 else 0)
                                                   - 0.25 * posDist ctx n1 n2 ]
              slotted = [ p | p@(_, n2) <- scored, sameSlot ctx n1 n2 ]
              pool = if null slotted then scored else slotted
          in if null pool then m
             else let n2 = snd (maximumBy (comparing fst) (reverse pool))
                      m' = Map.insert (treeId n1) (treeId n2) m
                  in if length (flatten n1) < maxSize && length (flatten n2) < maxSize
                       then recover ctx m' n1 n2 else m'

-- | Fragmenty, które się PRZENIOSŁY: nieznane po obu stronach (całe poddrzewo
-- niezmatchowane), z co najmniej 2 nośnymi liśćmi. Najpierw dokładne kopie,
-- potem bardzo podobny tekst ('relocMinSim').
relocate :: Ctx -> Tree -> Tree -> Matching -> Matching
relocate ctx root1 root2 m0 = foldl' (stage False) (foldl' (stage True) m0 [()]) [()]
  where
    cands root = sortOn (negate . length . flatten)
      [ t | t <- flatten root, not (null (treeChildren t)), bagSize t >= 2 ]
    c1 = cands root1
    c2 = cands root2
    bagSize t = length [ () | l <- flatten t, null (treeChildren l), treeLabel l /= treeText l ]
    free1 m t = all (\x -> not (treeId x `Map.member` m)) (flatten t)
    free2 used t = all (\x -> treeId x `Set.notMember` used) (flatten t)

    stage exactOnly m0' _ = foldl' (one exactOnly) m0' c1
    one exactOnly m n1
      | not (free1 m n1) = m
      | otherwise =
          let used = Set.fromList (Map.elems m)
              scored = [ (s, n2) | n2 <- c2
                                 , treeLabel n2 == treeLabel n1
                                 , free2 used n2
                                 , let s = if exactOnly
                                             then (if subtreeHash n1 == subtreeHash n2 && isoEq n1 n2 then 2 else 0)
                                             else textSim n1 n2
                                 , if exactOnly then s > 0 else s >= relocMinSim
                                 , let _ = s ]
              ranked = [ (s - 0.25 * posDist ctx n1 n2, n2) | (s, n2) <- scored ]
          in if null ranked then m
             else let n2 = snd (maximumBy (comparing fst) (reverse ranked))
                  in if exactOnly then matchWhole m n1 n2
                     else recover ctx (Map.insert (treeId n1) (treeId n2) m) n1 n2

relocMinSim :: Double
relocMinSim = 0.7

-- | Recovery w obrębie zmatchowanej pary: LCS dzieci (najpierw po dokładnej
-- izomorfii, potem po typie + tekście nośnych liści albo identycznym slocie).
recover :: Ctx -> Matching -> Tree -> Tree -> Matching
recover ctx m0 n1 n2 = foldl' pass m0 [exact, loose]
  where
    free1 mm = [ c | c <- treeChildren n1, not (treeId c `Map.member` mm) ]
    free2 mm = let used = Set.fromList (Map.elems mm)
               in [ c | c <- treeChildren n2, treeId c `Set.notMember` used ]
    exact a b = subtreeHash a == subtreeHash b && isoEq a b
    loose a b = treeLabel a == treeLabel b
                && (if null (treeChildren a) then treeText a == treeText b
                    else textSim a b >= minTextSim || (supported && sameSlot ctx a b))
    -- Slot sam w sobie to nie dowód: rodzic pary musi mieć własne potwierdzone podobieństwo.
    supported = dice m0 n1 n2 >= 0.3
    pass mm eq =
      foldl' (\acc (a, b) -> recover ctx (Map.insert (treeId a) (treeId b) acc) a b)
             mm (lcs eq (free1 mm) (free2 mm))

lcs :: (a -> a -> Bool) -> [a] -> [a] -> [(a, a)]
lcs eq xs ys = case foldr row base xs of { ((_, r) : _) -> r; [] -> [] }
  where
    base = replicate (length ys + 1) (0 :: Int, [])
    row x next = foldr go [(0, [])] (zip3 ys next (drop 1 next))
      where
        go (y, nj, nj1) acc@(rj1 : _) =
          let r | eq x y            = (fst nj1 + 1, (x, y) : snd nj1)
                | fst nj >= fst rj1 = nj
                | otherwise         = rj1
          in r : acc
        go _ [] = []

minTextSim :: Double
minTextSim = 0.5

-- | Podobieństwo "nośnych" liści (identyfikatory, literały -- label /= text;
-- interpunkcja pomijana, bo nic nie niesie). Oba puste -> 1.
textSim :: Tree -> Tree -> Double
textSim a b
  | s1 + s2 == 0 = 1
  | otherwise    = 2 * fromIntegral (sum (Map.intersectionWith min b1 b2)) / fromIntegral (s1 + s2)
  where
    bagOf t = Map.fromListWith (+)
      [ ((treeLabel l, treeText l), 1 :: Int) | l <- flatten t, null (treeChildren l), treeLabel l /= treeText l ]
    b1 = bagOf a
    b2 = bagOf b
    s1 = sum b1
    s2 = sum b2

-- | Liście z nośnym tekstem (identyfikator, literał), które zostały bez pary,
-- choć ich kontenery się zmatchowały (np. `int parsed;` -> `int parsed = f(s);`
-- -- zmienia się zagnieżdżenie, nazwa zostaje). W obrębie zmatchowanej pary
-- (od najmniejszej) paruje liście o tym samym typie i tekście, o ile są
-- JEDYNE takie po obu stronach. Zakres jest lokalny, więc nic nie skacze
-- między niepowiązanymi miejscami.
leafPass :: Tree -> Tree -> Matching -> Matching
leafPass root1 root2 m0 = foldl' step m0 pairs
  where
    byId2 = Map.fromList [ (treeId t, t) | t <- flatten root2 ]
    pairs = sortOn (length . flatten . fst)
      [ (a, b) | a <- flatten root1, not (null (treeChildren a))
               , Just i2 <- [Map.lookup (treeId a) m0], Just b <- [Map.lookup i2 byId2] ]
    carrier l = null (treeChildren l) && treeLabel l /= treeText l
    step m (a, b) =
      let used = Set.fromList (Map.elems m)
          ls1 = [ l | l <- flatten a, carrier l, not (treeId l `Map.member` m) ]
          ls2 = [ l | l <- flatten b, carrier l, treeId l `Set.notMember` used ]
          key l = (treeLabel l, treeText l)
          all1 = [ l | l <- flatten a, carrier l ]
          all2 = [ l | l <- flatten b, carrier l ]
          -- unikalność liczona wśród WSZYSTKICH liści zakresu (też już zmatchowanych)
          uniqIn (xs, alls) k = case [ x | x <- alls, key x == k ] of
            [_] -> case [ x | x <- xs, key x == k ] of { [x] -> Just x; _ -> Nothing }
            _   -> Nothing
      in foldl' (\acc l1 -> case (uniqIn (ls1, all1) (key l1), uniqIn (ls2, all2) (key l1)) of
                              (Just x, Just y) -> Map.insert (treeId x) (treeId y) acc
                              _ -> acc) m ls1
