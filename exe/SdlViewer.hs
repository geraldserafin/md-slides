{-# LANGUAGE OverloadedStrings #-}
-- | Natywna, cross-platform (SDL2) apka slideshow. Folder .md plików ->
-- lista slajdów ('SlideDoc.loadSlides'), każdy podzielony na sekcje na
-- granicach code-bloków (tekst przed kodem należy do TEJ sekcji, więc na
-- ekranie widać tylko tekst należący do aktualnie animowanego kodu, nie
-- cały plik naraz). Animacja (FLIP-jak, frame-by-frame) działa dla
-- języków które mają zwendorowaną gramatykę w 'Parse' (dziś: ts, cpp);
-- inne renderują się statycznie. Kod auto-skaluje się i centruje do
-- dostępnego miejsca w oknie; wyrównanie można nadpisać klasą fence'a
-- (` ```cpp .left `/`.right`, domyślnie center).
--
-- Pozycja/skala każdego TOKENU jest animowana NIEZALEŻNIE, w PIKSELACH
-- (nie przez jeden współdzielony "żywy" scale/baseX przemnażany co klatkę
-- przez wszystkich). To ważne: token który zanika (dying, bo zniknął z
-- nowego stanu) ma swój cel ZAMROŻONY w momencie śmierci -- nie jest
-- ciągnięty w nową stronę przez scale/pozycję NASTĘPNEGO kroku, który może
-- w ogóle go nie dotyczyć (np. przejście do sekcji bez kodu). Wcześniejsza
-- wersja miała globalny 'scale'/'baseX' liczony co klatkę z BIEŻĄCEGO
-- kroku -- przez co znikający kod "uciekał" w stronę nowego (pustego)
-- targetu zamiast zostać w miejscu i zblaknąć. Stąd ta architektura.
module Main (main) where

import qualified SDL
import qualified SDL.Font as Font
import qualified SDL.Image as Image
import SDL.Vect (V2 (..), V4 (..), Point (P))
import qualified Data.ByteString as BS
import qualified Data.Map.Strict as Map
import qualified Data.Set as Set
import qualified Data.Text as T
import Data.IORef
import Data.Maybe (mapMaybe, listToMaybe, isNothing)
import Data.Char (isAlpha)
import Data.Word (Word8)
import Control.Monad (unless, forM, forM_, when)
import Control.Concurrent (forkIO)
import Control.Concurrent.MVar (newEmptyMVar, takeMVar)
import Brick.BChan (BChan)
import Foreign.C.Types (CInt)
import System.Environment (getArgs)
import System.IO (hSetBuffering, stdout, BufferMode (LineBuffering))

import GumTree (Tree (..), Matching, flatten, match)
import qualified Parse
import Parse (Lang (..))
import Layout (GridPos, layoutLeaves)
import SlideDoc (Slide (..), Section (..), TextItem (..), loadSlides)
import qualified Presenter

fontPath :: FilePath
fontPath = "assets/DejaVuSansMono.ttf"

codeFontSize, headingFontSize, textFontSize :: Int
codeFontSize    = 22
headingFontSize = 30
textFontSize    = 20

marginX, codeMarginY, bottomMargin :: CInt
marginX = 40
codeMarginY = 20
bottomMargin = 40

minScale, maxScale :: Double
minScale = 0.5
maxScale = 1.6

data Align = AlignLeft | AlignCenter | AlignRight

-- | Wyrównanie bloku kodu z klas fence'a -- domyślnie wycentrowany.
alignFromClasses :: [T.Text] -> Align
alignFromClasses classes
  | "left"  `elem` classes = AlignLeft
  | "right" `elem` classes = AlignRight
  | otherwise              = AlignCenter

-- Kategoria tokenu (w kodzie) -> kolor. Ciemny motyw. Zbiór słów kluczowych
-- i nazw node'ów połączony z TS i C++ (nadmiarowe dopasowania są
-- nieszkodliwe -- token po prostu zawsze dostaje ten sam kolor kategorii).
tokenClass :: String -> String
tokenClass label
  | label `Set.member` keywords                 = "keyword"
  | label `elem` ["number", "string", "true", "false", "null", "undefined", "nullptr"] = "builtin"
  | label `elem` ["type_identifier", "primitive_type", "sized_type_specifier"] = "type"
  | label `elem` ["property_identifier", "field_identifier"] = "property"
  | label == "identifier"                       = "ident"
  | label == "comment"                           = "comment"
  | all (not . isAlpha) label                   = "punct"
  | otherwise                                    = "plain"
  where
    keywords = Set.fromList
      [ -- TypeScript
        "function", "return", "const", "let", "var", "for", "if", "else"
      , "interface", "export", "import", "from", "of", "new", "class"
      , "extends", "implements", "type", "public", "private", "protected"
      , "readonly", "static", "async", "await", "in", "instanceof", "typeof"
        -- C++
      , "struct", "namespace", "template", "typename", "using", "auto"
      , "constexpr", "noexcept", "virtual", "override", "friend", "operator"
      , "try", "catch", "throw", "switch", "case", "break", "continue"
      , "while", "do", "sizeof", "enum", "union", "mutable", "explicit"
      , "inline", "default", "delete", "nullptr", "this"
      ]

colorFor :: String -> V4 Word8
colorFor cls = case cls of
  "keyword"  -> V4 0xc6 0x78 0xdd 255
  "ident"    -> V4 0xe5 0xe9 0xf0 255
  "property" -> V4 0x61 0xaf 0xef 255
  "type"     -> V4 0xe5 0xc0 0x7b 255
  "builtin"  -> V4 0xd1 0x9a 0x66 255
  "comment"  -> V4 0x5c 0x63 0x70 255
  "punct"    -> V4 0x6b 0x73 0x85 255
  "heading"  -> V4 0xff 0xff 0xff 255
  "static"   -> V4 0x9a 0xa3 0xb2 255
  _          -> V4 0xab 0xb2 0xbf 255

backgroundColor :: V4 Word8
backgroundColor = V4 0x1e 0x1e 0x2e 255

-- | Dla sekcji, których języka nie umiemy animować: przenieś jej kod do
-- statycznego tekstu (wyświetlony, ale bez diffu/animacji) zamiast go gubić.
-- Język wyszukiwany wśród WSZYSTKICH klas (nie tylko pierwszej) -- żeby
-- kolejność ` ```cpp .left ` vs ` ```.left cpp ` nie miała znaczenia.
normalizeSection :: Section -> (Section, Maybe Lang, Align)
normalizeSection sec = case mLang of
  Just _  -> (sec, mLang, align)
  Nothing | null (sectionCode sec) -> (sec, Nothing, align)
          | otherwise ->
              ( sec { sectionCode = []
                    , sectionText = sectionText sec ++
                        [ TIText l | code <- sectionCode sec, l <- T.lines (decodeLenient code) ]
                    }
              , Nothing, align )
  where
    mLang = listToMaybe (mapMaybe Parse.langFromTag (sectionClasses sec))
    align = alignFromClasses (sectionClasses sec)
    decodeLenient bs = T.pack (map (toEnum . fromIntegral) (BS.unpack bs))

-- | Jeden "krok nawigacji": jedna sekcja, jeden stan kodu w jej obrębie
-- (albo jeden pusty krok, jeśli sekcja nie ma animowanego kodu).
data StepInfo = StepInfo
  { siCode      :: BS.ByteString
  , siLang      :: Maybe Lang
  , siAlign     :: Align
  , siCentered  :: Bool -- ^ Sekcja bez ŻADNEGO fence'a (nie tylko bez rozpoznanego
                        -- języka) -- tytuł/tekst wycentrowany na środku ekranu,
                        -- jak slajd tytułowy, zamiast tekstu przyklejonego do góry.
  , siText      :: [TextItem] -- ^ Znormalizowany tekst sekcji (z ew. dofoldowanym
                               -- kodem nierozpoznanego języka) -- to, co faktycznie
                               -- się rysuje, nie surowy 'sectionText' ze 'slides'.
  , siSlide     :: Int
  }

flattenSteps :: [Slide] -> [StepInfo]
flattenSteps slides =
  [ StepInfo code lang align (isNothing lang && null (sectionClasses rawSec)) (sectionText sec) i
  | (i, slide) <- zip [0 ..] slides
  , rawSec <- slideSections slide
  , let (sec, lang, align) = normalizeSection rawSec
  , code <- if null (sectionCode sec) then [""] else sectionCode sec
  ]

-- | Gdzie i w jakiej skali rysować token w danym kroku -- liczone RAZ przy
-- wejściu na krok (nie co klatkę), z bieżącego rozmiaru okna.
data Placement = Placement
  { plScale :: !Double
  , plBaseX :: !Double
  , plTopY  :: !Double
  , plCharW :: !Double
  , plLineH :: !Double
  }

toPixel :: Placement -> GridPos -> (Double, Double)
toPixel pl (row, col) =
  ( plBaseX pl + fromIntegral col * plCharW pl * plScale pl
  , plTopY  pl + fromIntegral row * plLineH pl * plScale pl
  )

computePlacement :: SDL.Renderer -> IORef ImgCache -> Int -> Int -> Int -> CInt -> CInt -> Align
                  -> [TextItem] -> [(Tree, GridPos)] -> IO Placement
computePlacement renderer imgCache charW lineH textCharW winW winH align secText layout = do
  textHeight <- staticBlockHeight renderer imgCache availW textCharW 30 secText
  let availH = winH - textHeight - codeMarginY - bottomMargin
      scaleH = if codeHpx <= 0 then 1 else fromIntegral availH / fromIntegral codeHpx
      scale  = max minScale (min maxScale (min scaleW scaleH))
      scaledCodeW = fromIntegral codeWpx * scale
      baseX = case align of
        AlignLeft   -> fromIntegral marginX
        AlignCenter -> fromIntegral marginX + max 0 (fromIntegral availW - scaledCodeW) / 2
        AlignRight  -> fromIntegral marginX + max 0 (fromIntegral availW - scaledCodeW)
      topY = fromIntegral textHeight + fromIntegral codeMarginY
  pure (Placement scale baseX topY (fromIntegral charW) (fromIntegral lineH))
  where
    availW = winW - 2 * marginX
    (cols, rows) = layoutBounds layout
    codeWpx = cols * charW
    codeHpx = rows * lineH
    scaleW = if codeWpx <= 0 then 1 else fromIntegral availW / fromIntegral codeWpx

data TokenAnim = TokenAnim
  { taText        :: String
  , taClass       :: String
  , taCurX        :: !Double
  , taCurY        :: !Double
  , taTargetX     :: !Double
  , taTargetY     :: !Double
  , taCurScale    :: !Double
  , taTargetScale :: !Double
  , taCurAlpha    :: !Double
  , taTargetAlpha :: !Double
  , taDying       :: !Bool
  , taDelay       :: !Double -- ^ Sekundy do odczekania przed startem easingu --
                             -- lekki "stagger" (zanikające od razu, dopasowane
                             -- chwilę potem, nowe jeszcze chwilę później), bez
                             -- blokowania na pełnym zakończeniu poprzedniej fazy.
  }

type AnimMap = Map.Map String TokenAnim

-- | Cache tekstur obrazków (ścieżka -> tekstura + oryginalny rozmiar w px).
-- Oryginalny rozmiar potrzebny do liczenia skali/wysokości przy layoucie.
type ImgCache = Map.Map FilePath (SDL.Texture, CInt, CInt)

-- | Kanoniczne klucze: treeId (w drzewie kroku i) -> stabilny string-key,
-- śledzony przez całą globalną sekwencję kroków (dzięki czemu nawet
-- przejścia MIĘDZY sekcjami/slajdami/językami animują się tym samym
-- mechanizmem -- stary fade-out, nowy fade-in, za darmo). 'matchings!!i'
-- to 'match' między krokiem i a i+1 (puste, jeśli różne/nieanimowalne
-- języki po obu stronach -- wtedy nic się nie przenosi, co jest poprawne).
buildCanonicalKeys :: [Maybe Tree] -> [Matching] -> [Map.Map Int String]
buildCanonicalKeys roots matchings = map keysAt [0 .. n - 1]
  where
    n = length roots
    fallback i rawId = "k" ++ show i ++ "_" ++ show rawId

    keysAt :: Int -> Map.Map Int String
    keysAt i = case roots !! i of
      Nothing   -> Map.empty
      Just root
        | i == n - 1 -> Map.fromList [ (treeId t, fallback i (treeId t)) | t <- flatten root ]
        | otherwise  ->
            let laterKeys = keysAt (i + 1)
                m         = matchings !! i
                keyFor t  = case Map.lookup (treeId t) m of
                  Just id2 -> Map.findWithDefault (fallback i (treeId t)) id2 laterKeys
                  Nothing  -> fallback i (treeId t)
            in Map.fromList [ (treeId t, keyFor t) | t <- flatten root ]

buildInitial :: Placement -> [(Tree, GridPos)] -> Map.Map Int String -> AnimMap
buildInitial pl layout keys = Map.fromList
  [ (key, TokenAnim txt cls x y x y (plScale pl) (plScale pl) 1 1 False 0)
  | (t, gp) <- layout
  , let key = keyOf keys t
        txt = treeText t
        cls = tokenClass (treeLabel t)
        (x, y) = toPixel pl gp
  ]

keyOf :: Map.Map Int String -> Tree -> String
keyOf keys t = Map.findWithDefault ("k?" ++ show (treeId t)) (treeId t) keys

-- | Lekki stagger: wszystko jedzie NARAZ (nie czeka na zakończenie
-- poprzedniego etapu), ale z małym przesunięciem czasowym -- zanikające
-- tokeny ruszają od razu, dopasowane chwilę potem, nowe jeszcze chwilę
-- później. 'taDelay' to to przesunięcie, zjadane w 'tick'.
dyingDelay, moveDelay, fadeInDelay :: Double
dyingDelay  = 0
moveDelay   = 0.04
fadeInDelay = 0.08

advanceTo :: Placement -> [(Tree, GridPos)] -> Map.Map Int String -> AnimMap -> AnimMap
advanceTo pl layout keys old = Map.union updatedAndNew dyingLeftovers
  where
    newKeyOf = keyOf keys
    newKeys = Set.fromList [ newKeyOf t | (t, _) <- layout ]

    updatedAndNew = Map.fromList
      [ (key, upd)
      | (t, gp) <- layout
      , let key = newKeyOf t
            txt = treeText t
            cls = tokenClass (treeLabel t)
            (x, y) = toPixel pl gp
            upd = case Map.lookup key old of
              Just prev -> prev { taText = txt, taClass = cls
                                 , taTargetX = x, taTargetY = y
                                 , taTargetScale = plScale pl
                                 , taTargetAlpha = 1, taDying = False
                                 , taDelay = moveDelay
                                 }
              Nothing   -> TokenAnim txt cls x y x y (plScale pl) (plScale pl) 0 1 False fadeInDelay
      ]

    dyingLeftovers = Map.fromList
      [ (key, anim { taTargetAlpha = 0, taDying = True, taDelay = dyingDelay })
      | (key, anim) <- Map.toList old
      , not (key `Set.member` newKeys)
      ]

tick :: Double -> AnimMap -> AnimMap
tick dt = Map.filter keep . Map.map step
  where
    tau = 0.12
    step a
      | taDelay a > 0 = a { taDelay = max 0 (taDelay a - dt) }
      | otherwise =
          let ease = 1 - exp (negate dt / tau)
          in a
            { taCurX     = lerp (taCurX a)     (taTargetX a)     ease
            , taCurY     = lerp (taCurY a)     (taTargetY a)     ease
            , taCurScale = lerp (taCurScale a) (taTargetScale a) ease
            , taCurAlpha = lerp (taCurAlpha a) (taTargetAlpha a) ease
            }
    lerp cur target e = cur + (target - cur) * e
    keep a = not (taDying a) || taCurAlpha a > 0.02

-- | Szerokość/wysokość treści w jednostkach znaki/wiersze (nie piksele).
layoutBounds :: [(Tree, GridPos)] -> (Int, Int)
layoutBounds = foldl' step (0, 0)
  where
    step (mc, mr) (t, (row, col)) = (max mc (col + length (treeText t)), max mr (row + 1))

main :: IO ()
main = do
  hSetBuffering stdout LineBuffering
  args <- getArgs
  let dir = case args of
        (d : _) -> d
        []      -> "slides"

  slides <- loadSlides dir
  when (null slides) $ error ("brak plikow .md w " ++ dir)

  SDL.initializeAll
  Font.initialize
  font        <- Font.load fontPath codeFontSize
  headingFont <- Font.load fontPath headingFontSize
  textFont    <- Font.load fontPath textFontSize
  (charW, _) <- Font.size font (T.pack "M")
  (textCharW, _) <- Font.size textFont (T.pack "M")
  let lineH = round (fromIntegral codeFontSize * 1.5 :: Double) :: Int

  window <- SDL.createWindow "slides" SDL.defaultWindow
    { SDL.windowInitialSize = V2 1100 750
    , SDL.windowResizable = True
    }
  renderer <- SDL.createRenderer window (-1) SDL.defaultRenderer

  let steps = flattenSteps slides
      n     = length steps

  roots <- forM steps $ \si -> case siLang si of
    Nothing   -> pure Nothing
    Just lang -> Just <$> Parse.parseOne lang (siCode si)

  let matchings =
        [ case (siLang a, siLang b, roots !! i, roots !! (i + 1)) of
            (Just la, Just lb, Just ra, Just rb) | la == lb -> match ra rb
            _ -> Map.empty
        | i <- [0 .. n - 2], let a = steps !! i; b = steps !! (i + 1)
        ]
      canonicalKeys = buildCanonicalKeys roots matchings
      layouts =
        [ case (siLang si, roots !! i) of
            (Just _, Just root) -> layoutLeaves (siCode si) root
            _ -> []
        | (i, si) <- zip [0 ..] steps
        ]

  texCache <- newIORef Map.empty
  imgCache <- newIORef Map.empty
  idxRef   <- newIORef (0 :: Int)
  prevTimeRef <- newIORef =<< (SDL.time :: IO Double)

  V2 winW0 winH0 <- SDL.get (SDL.windowSize window)
  let step0 = steps !! 0
  pl0 <- computePlacement renderer imgCache charW lineH textCharW winW0 winH0 (siAlign step0) (siText step0) (layouts !! 0)
  animRef <- newIORef (buildInitial pl0 (layouts !! 0) (canonicalKeys !! 0))

  -- Konsola prezentera (brick/vty) w osobnym wątku -- SDL MUSI zostać na
  -- głównym (twardy wymóg na macOS/Cocoa). 'doneVar' pozwala poczekać aż
  -- vty naprawdę posprząta terminal, zanim proces się skończy.
  presenterChan <- Presenter.newPresenterChannel
  presenterDone <- newEmptyMVar
  _ <- forkIO (Presenter.runPresenter presenterChan presenterDone (buildPresenterState slides steps 0))

  loop renderer window font headingFont textFont texCache imgCache animRef idxRef prevTimeRef presenterChan
       slides steps n layouts canonicalKeys charW textCharW lineH

  Font.free font
  Font.free headingFont
  Font.free textFont
  Font.quit
  SDL.destroyWindow window
  SDL.quit

  Presenter.quitPresenter presenterChan
  takeMVar presenterDone

-- | Pierwszy nagłówek w slajdzie (z dowolnej sekcji) jako tytuł do
-- konsoli prezentera; brak nagłówka -> fallback.
slideTitle :: Slide -> T.Text
slideTitle slide = case [ t | sec <- slideSections slide, TIHeading t <- sectionText sec ] of
  (t : _) -> t
  []      -> "(bez tytulu)"

-- | Buduje stan dla TUI prezentera (patrz 'Presenter') z aktualnego kroku
-- nawigacji i wysyła go kanałem -- TUI w swoim wątku samo się przerysuje.
buildPresenterState :: [Slide] -> [StepInfo] -> Int -> Presenter.PresenterState
buildPresenterState slides steps i = Presenter.PresenterState
  { Presenter.psSlideNo   = curIdx + 1
  , Presenter.psSlideTot  = length slides
  , Presenter.psStepNo    = length (takeWhile (/= i) inSlide) + 1
  , Presenter.psStepTot   = length inSlide
  , Presenter.psTitle     = slideTitle curSlide
  , Presenter.psNotes     = slideNotes curSlide
  , Presenter.psNextTitle = slideTitle <$> listToMaybe (drop (curIdx + 1) slides)
  , Presenter.psNextNotes = maybe [] slideNotes (listToMaybe (drop (curIdx + 1) slides))
  }
  where
    curIdx   = siSlide (steps !! i)
    curSlide = slides !! curIdx
    inSlide  = [ k | (k, s) <- zip [0 ..] steps, siSlide s == curIdx ]

pushPresenter :: BChan Presenter.PresenterEvent -> [Slide] -> [StepInfo] -> Int -> IO ()
pushPresenter chan slides steps i = Presenter.pushPresenterState chan (buildPresenterState slides steps i)

loop :: SDL.Renderer -> SDL.Window -> Font.Font -> Font.Font -> Font.Font
     -> IORef (Map.Map (String, String) SDL.Texture) -> IORef ImgCache
     -> IORef AnimMap -> IORef Int -> IORef Double -> BChan Presenter.PresenterEvent
     -> [Slide] -> [StepInfo] -> Int
     -> [[(Tree, GridPos)]] -> [Map.Map Int String] -> Int -> Int -> Int -> IO ()
loop renderer window font headingFont textFont texCache imgCache animRef idxRef prevTimeRef presenterChan
     slides steps nSteps layouts canonicalKeys charW textCharW lineH = go
  where
    go = do
      events <- SDL.pollEvents
      let quit = any isQuitEvent events

      forM_ events $ \e -> case SDL.eventPayload e of
        SDL.KeyboardEvent kd | SDL.keyboardEventKeyMotion kd == SDL.Pressed -> do
          let code = SDL.keysymKeycode (SDL.keyboardEventKeysym kd)
          i <- readIORef idxRef
          when (code == SDL.KeycodeRight && i < nSteps - 1) $ navigateTo (i + 1)
          when (code == SDL.KeycodeLeft && i > 0)            $ navigateTo (i - 1)
        _ -> pure ()

      now <- SDL.time
      prev <- readIORef prevTimeRef
      writeIORef prevTimeRef now
      let dt = max 0 (min 0.1 (now - prev))
      modifyIORef' animRef (tick dt)

      SDL.rendererDrawColor renderer SDL.$= backgroundColor
      SDL.clear renderer

      i <- readIORef idxRef
      let si = steps !! i

      V2 winW winH <- SDL.get (SDL.windowSize window)
      let availW = winW - 2 * marginX
      if siCentered si
        then do
          blockH <- staticBlockHeight renderer imgCache availW textCharW 0 (siText si)
          let startY = max 0 ((winH - blockH) `div` 2)
          _ <- drawTextBlock renderer headingFont textFont texCache imgCache winW availW textCharW True startY (siText si)
          pure ()
        else do
          _ <- drawTextBlock renderer headingFont textFont texCache imgCache winW availW textCharW False 30 (siText si)
          pure ()
      -- textHeight tutaj nie jest już potrzebny do pozycjonowania kodu --
      -- to się dzieje raz, w 'navigateTo', przy pieczeniu docelowej
      -- pozycji/skali każdego tokenu (patrz komentarz na górze pliku).

      anim <- readIORef animRef
      forM_ (Map.elems anim) $ \a -> when (not (null (taText a))) $ do
        tex <- getTexture renderer font texCache (taClass a) (taText a)
        SDL.textureAlphaMod tex SDL.$= round (clamp01 (taCurAlpha a) * 255)
        info <- SDL.queryTexture tex
        let x = round (taCurX a)
            y = round (taCurY a)
            w = round (fromIntegral (SDL.textureWidth info) * taCurScale a)
            h = round (fromIntegral (SDL.textureHeight info) * taCurScale a)
        SDL.copy renderer tex Nothing (Just (SDL.Rectangle (P (V2 x y)) (V2 w h)))

      SDL.present renderer
      SDL.delay 16
      unless quit go

    navigateTo j = do
      writeIORef idxRef j
      let sj = steps !! j
      V2 winW winH <- SDL.get (SDL.windowSize window)
      pl <- computePlacement renderer imgCache charW lineH textCharW winW winH (siAlign sj) (siText sj) (layouts !! j)
      modifyIORef' animRef (advanceTo pl (layouts !! j) (canonicalKeys !! j))
      pushPresenter presenterChan slides steps j

    clamp01 v = max 0 (min (1 :: Double) v)

    isQuitEvent e = case SDL.eventPayload e of
      SDL.QuitEvent -> True
      SDL.KeyboardEvent kd -> SDL.keyboardEventKeyMotion kd == SDL.Pressed
                           && SDL.keysymKeycode (SDL.keyboardEventKeysym kd) == SDL.KeycodeEscape
      _ -> False

-- | Rozmiar obrazka wpasowany w dostępną szerokość (max 70% 'availW') i
-- wysokość (max 320px), proporcje zachowane -- nigdy nie powiększamy ponad
-- oryginał.
imageDrawSize :: CInt -> CInt -> CInt -> (CInt, CInt)
imageDrawSize availW origW origH = (round (ow * s), round (oh * s))
  where
    ow = fromIntegral origW :: Double
    oh = fromIntegral origH :: Double
    maxW = fromIntegral availW * 0.7
    maxH = 320
    s = minimum [1, maxW / max 1 ow, maxH / max 1 oh]

-- | Tekstura obrazka (plus jego oryginalny rozmiar), z cache po ścieżce.
getImageTexture :: SDL.Renderer -> IORef ImgCache -> FilePath -> IO (SDL.Texture, CInt, CInt)
getImageTexture renderer cacheRef path = do
  cache <- readIORef cacheRef
  case Map.lookup path cache of
    Just entry -> pure entry
    Nothing -> do
      tex <- Image.loadTexture renderer path
      info <- SDL.queryTexture tex
      let entry = (tex, SDL.textureWidth info, SDL.textureHeight info)
      modifyIORef' cacheRef (Map.insert path entry)
      pure entry

-- | Wysokość jednego elementu treści (nagłówek/akapit/obrazek), w pikselach.
itemHeight :: SDL.Renderer -> IORef ImgCache -> CInt -> Int -> TextItem -> IO CInt
itemHeight renderer imgCache availW textCharW item = case item of
  TIHeading _ -> pure (fromIntegral (headingFontSize + 14))
  TIText t
    | T.null t  -> pure 10
    | otherwise -> pure (fromIntegral (length (wrapText maxChars t) * (textFontSize + 10)))
  TIImage path _ -> do
    (_, ow, oh) <- getImageTexture renderer imgCache path
    let (_, dh) = imageDrawSize availW ow oh
    pure (dh + 14)
  where
    maxChars = max 10 (fromIntegral availW `div` max 1 textCharW)

-- | Czysta (bez rysowania) wysokość całego blocka treści, z zadanym offsetem
-- startowym -- używane przy liczeniu 'Placement' (gdzie zaczyna się kod) i
-- przy centrowaniu slajdów bez kodu (offset 0, startY liczony z wyniku).
staticBlockHeight :: SDL.Renderer -> IORef ImgCache -> CInt -> Int -> CInt -> [TextItem] -> IO CInt
staticBlockHeight renderer imgCache availW textCharW offset items =
  (offset +) . sum <$> mapM (itemHeight renderer imgCache availW textCharW) items

-- | Rysuje blok treści (nagłówki/akapity/obrazki) zaczynając od 'startY'.
-- 'centerBody' == True: akapity (i nagłówki, i obrazki) wycentrowane w
-- poziomie -- tryb "slajdu tytułowego". False: nagłówki/obrazki centrowane
-- jak zawsze, akapity do lewej (tryb slajdu z kodem, tekst nad kodem).
-- Zwraca ile pikseli w pionie zajął (nie licząc kodu, który rysuje się
-- gdzie indziej).
drawTextBlock :: SDL.Renderer -> Font.Font -> Font.Font
              -> IORef (Map.Map (String, String) SDL.Texture) -> IORef ImgCache
              -> CInt -> CInt -> Int -> Bool -> CInt -> [TextItem] -> IO CInt
drawTextBlock renderer headingFont textFont texCache imgCache winW availW textCharW centerBody startY0 = go startY0
  where
    maxChars = max 10 (fromIntegral availW `div` max 1 textCharW)

    go y [] = pure y
    go y (item : rest) = case item of
      TIHeading line -> do
        drawLine headingFont "heading" True line y
        go (y + fromIntegral (headingFontSize + 14)) rest
      TIText line
        | T.null line -> go (y + 10) rest
        | otherwise -> do
            let ls' = wrapText maxChars line
            y' <- foldM' y ls' $ \yy l -> do
              drawLine textFont "static" centerBody l yy
              pure (yy + fromIntegral (textFontSize + 10))
            go y' rest
      TIImage path _ -> do
        (tex, ow, oh) <- getImageTexture renderer imgCache path
        let (dw, dh) = imageDrawSize availW ow oh
            x = (winW - dw) `div` 2
        SDL.copy renderer tex Nothing (Just (SDL.Rectangle (P (V2 x y)) (V2 dw dh)))
        go (y + dh + 14) rest

    drawLine fnt cls centered txt y = do
      tex <- getTexture renderer fnt texCache cls (T.unpack txt)
      info <- SDL.queryTexture tex
      let tw = SDL.textureWidth info
          x  = if centered then (winW - tw) `div` 2 else marginX
      SDL.copy renderer tex Nothing (Just (SDL.Rectangle (P (V2 x y)) (V2 tw (SDL.textureHeight info))))

    foldM' z [] _ = pure z
    foldM' z (x : xs) f = f z x >>= \z' -> foldM' z' xs f

-- | Proste zachłanne wrapowanie po słowach, do zadanej liczby znaków w linii.
wrapText :: Int -> T.Text -> [T.Text]
wrapText maxChars txt
  | maxChars < 1          = [txt]
  | T.length txt <= maxChars = [txt]
  | otherwise = case T.words txt of
      []       -> []
      (w : ws) -> goWrap w ws
  where
    goWrap acc [] = [acc]
    goWrap acc (w : ws)
      | T.length acc + 1 + T.length w <= maxChars = goWrap (acc <> " " <> w) ws
      | otherwise = acc : goWrap w ws

getTexture :: SDL.Renderer -> Font.Font -> IORef (Map.Map (String, String) SDL.Texture)
           -> String -> String -> IO SDL.Texture
getTexture renderer font cacheRef cls txt = do
  cache <- readIORef cacheRef
  case Map.lookup (cls, txt) cache of
    Just tex -> pure tex
    Nothing -> do
      -- 'blended' = antyaliasowane (alpha-blended) renderowanie, w
      -- przeciwieństwie do 'solid' (szybkie, ale pikselowate/bez AA).
      surface <- Font.blended font (colorFor cls) (T.pack txt)
      tex <- SDL.createTextureFromSurface renderer surface
      SDL.freeSurface surface
      SDL.textureBlendMode tex SDL.$= SDL.BlendAlphaBlend
      modifyIORef' cacheRef (Map.insert (cls, txt) tex)
      pure tex
