{-# LANGUAGE OverloadedStrings #-}

module Main (main) where

import qualified Data.ByteString as BS
import qualified Data.ByteString.Char8 as BC
import qualified Data.Map.Strict as Map
import qualified Data.Set as Set
import Data.IORef
import Data.List (sortOn)
import Data.Char (isAlpha)
import Control.Monad (void)
import Text.Printf (printf)

import qualified Graphics.UI.Threepenny as UI
import Graphics.UI.Threepenny.Core

import GumTree (Tree (..), Matching, flatten, match)
import Parse (Lang (TypeScript), parseTwo)

-- | Refactor "sum koszyka": pętla imperatywna var/for -> typowana, funkcyjna
-- wersja z wydzieloną funkcją i .reduce. Każdy stan to JEDNA konkretna zmiana.
states :: [BS.ByteString]
states =
  [ -- 1. punkt startowy: imperatywnie, bez typów
    "function calc(items) {\n\
    \  var total = 0;\n\
    \  for (var i = 0; i < items.length; i++) {\n\
    \    total = total + items[i].price * items[i].qty;\n\
    \  }\n\
    \  return total;\n\
    \}"

  , -- 2. var -> let
    "function calc(items) {\n\
    \  let total = 0;\n\
    \  for (let i = 0; i < items.length; i++) {\n\
    \    total = total + items[i].price * items[i].qty;\n\
    \  }\n\
    \  return total;\n\
    \}"

  , -- 3. dodaj typ Item (nowy blok na górze)
    "interface Item {\n\
    \  price: number;\n\
    \  qty: number;\n\
    \}\n\
    \\n\
    \function calc(items) {\n\
    \  let total = 0;\n\
    \  for (let i = 0; i < items.length; i++) {\n\
    \    total = total + items[i].price * items[i].qty;\n\
    \  }\n\
    \  return total;\n\
    \}"

  , -- 4. otypuj parametr i zwracaną wartość
    "interface Item {\n\
    \  price: number;\n\
    \  qty: number;\n\
    \}\n\
    \\n\
    \function calc(items: Item[]): number {\n\
    \  let total = 0;\n\
    \  for (let i = 0; i < items.length; i++) {\n\
    \    total = total + items[i].price * items[i].qty;\n\
    \  }\n\
    \  return total;\n\
    \}"

  , -- 5. indexed for -> for...of
    "interface Item {\n\
    \  price: number;\n\
    \  qty: number;\n\
    \}\n\
    \\n\
    \function calc(items: Item[]): number {\n\
    \  let total = 0;\n\
    \  for (const item of items) {\n\
    \    total = total + item.price * item.qty;\n\
    \  }\n\
    \  return total;\n\
    \}"

  , -- 6. total = total + x -> total += x
    "interface Item {\n\
    \  price: number;\n\
    \  qty: number;\n\
    \}\n\
    \\n\
    \function calc(items: Item[]): number {\n\
    \  let total = 0;\n\
    \  for (const item of items) {\n\
    \    total += item.price * item.qty;\n\
    \  }\n\
    \  return total;\n\
    \}"

  , -- 7. rename calc -> calculateTotal
    "interface Item {\n\
    \  price: number;\n\
    \  qty: number;\n\
    \}\n\
    \\n\
    \function calculateTotal(items: Item[]): number {\n\
    \  let total = 0;\n\
    \  for (const item of items) {\n\
    \    total += item.price * item.qty;\n\
    \  }\n\
    \  return total;\n\
    \}"

  , -- 8. rename items -> cartItems
    "interface Item {\n\
    \  price: number;\n\
    \  qty: number;\n\
    \}\n\
    \\n\
    \function calculateTotal(cartItems: Item[]): number {\n\
    \  let total = 0;\n\
    \  for (const item of cartItems) {\n\
    \    total += item.price * item.qty;\n\
    \  }\n\
    \  return total;\n\
    \}"

  , -- 9. guard clause na pusty koszyk
    "interface Item {\n\
    \  price: number;\n\
    \  qty: number;\n\
    \}\n\
    \\n\
    \function calculateTotal(cartItems: Item[]): number {\n\
    \  if (cartItems.length === 0) {\n\
    \    return 0;\n\
    \  }\n\
    \\n\
    \  let total = 0;\n\
    \  for (const item of cartItems) {\n\
    \    total += item.price * item.qty;\n\
    \  }\n\
    \  return total;\n\
    \}"

  , -- 10. function declaration -> const + arrow function
    "interface Item {\n\
    \  price: number;\n\
    \  qty: number;\n\
    \}\n\
    \\n\
    \const calculateTotal = (cartItems: Item[]): number => {\n\
    \  if (cartItems.length === 0) {\n\
    \    return 0;\n\
    \  }\n\
    \\n\
    \  let total = 0;\n\
    \  for (const item of cartItems) {\n\
    \    total += item.price * item.qty;\n\
    \  }\n\
    \  return total;\n\
    \};"

  , -- 11a. Extract Method, krok 1: dodaj nową funkcję (logika na razie
    -- zduplikowana) -- jeszcze NIE dotykamy pętli w calculateTotal. Bez tego
    -- "item.price * item.qty" w nowej funkcji jest strukturalnie identyczne
    -- z tym co ZARAZ usuwamy z pętli, i algorytm (poprawnie wg hashu, błędnie
    -- wg intencji) próbuje je potraktować jako "to samo co się przeniosło".
    "interface Item {\n\
    \  price: number;\n\
    \  qty: number;\n\
    \}\n\
    \\n\
    \function itemTotal(item: Item): number {\n\
    \  return item.price * item.qty;\n\
    \}\n\
    \\n\
    \const calculateTotal = (cartItems: Item[]): number => {\n\
    \  if (cartItems.length === 0) {\n\
    \    return 0;\n\
    \  }\n\
    \\n\
    \  let total = 0;\n\
    \  for (const item of cartItems) {\n\
    \    total += item.price * item.qty;\n\
    \  }\n\
    \  return total;\n\
    \};"

  , -- 11b. Extract Method, krok 2: podmień call site na wywołanie nowej funkcji
    "interface Item {\n\
    \  price: number;\n\
    \  qty: number;\n\
    \}\n\
    \\n\
    \function itemTotal(item: Item): number {\n\
    \  return item.price * item.qty;\n\
    \}\n\
    \\n\
    \const calculateTotal = (cartItems: Item[]): number => {\n\
    \  if (cartItems.length === 0) {\n\
    \    return 0;\n\
    \  }\n\
    \\n\
    \  let total = 0;\n\
    \  for (const item of cartItems) {\n\
    \    total += itemTotal(item);\n\
    \  }\n\
    \  return total;\n\
    \};"

  , -- 12. pętla + guard -> jedno wyrażenie .reduce
    "interface Item {\n\
    \  price: number;\n\
    \  qty: number;\n\
    \}\n\
    \\n\
    \function itemTotal(item: Item): number {\n\
    \  return item.price * item.qty;\n\
    \}\n\
    \\n\
    \const calculateTotal = (cartItems: Item[]): number =>\n\
    \  cartItems.reduce((total, item) => total + itemTotal(item), 0);"

  , -- 13. export publicznego API
    "interface Item {\n\
    \  price: number;\n\
    \  qty: number;\n\
    \}\n\
    \\n\
    \export function itemTotal(item: Item): number {\n\
    \  return item.price * item.qty;\n\
    \}\n\
    \\n\
    \export const calculateTotal = (cartItems: Item[]): number =>\n\
    \  cartItems.reduce((total, item) => total + itemTotal(item), 0);"
  ]

main :: IO ()
main = startGUI defaultConfig { jsStatic = Nothing } setup

setup :: Window -> UI ()
setup window = do
  _ <- return window # set title "slides — code diff viewer"

  -- dla każdej sąsiedniej pary stanów liczymy matching (treeId w stanie i ->
  -- treeId w stanie i+1); 'canonicalKeys' daje każdemu tokenowi w CAŁEJ
  -- sekwencji jeden stabilny identyfikator, śledzony przez wszystkie stany.
  trees <- liftIO $ mapM (uncurry (parseTwo TypeScript)) (zip states (drop 1 states))
  let roots          = map fst trees ++ [snd (last trees)]
      stepMatchings   = map (uncurry match) trees
      canonicalKeys   = buildCanonicalKeys roots stepMatchings

  codeDiv <- UI.div
    # set UI.id_ "code"
    # set style [ ("font-family", "ui-monospace, monospace")
                , ("white-space", "pre")
                , ("font-size", "22px")
                , ("padding", "40px 60px")
                , ("line-height", "1.6")
                , ("overflow-x", "auto")
                ]
  hint <- UI.div
    # set UI.text "<- / -> aby zmienic stan (animacja FLIP, dziala w kazdej przegladarce)"
    # set style [("padding", "20px 60px 0"), ("color", "#888"), ("font-family", "sans-serif")]
  counter <- UI.div
    # set style [("padding", "4px 60px 0"), ("color", "#6b7385"), ("font-family", "sans-serif"), ("font-size", "13px")]

  body <- getBody window
  _ <- element body #+ [element hint, element counter, element codeDiv]

  runFunction $ ffi "document.head.insertAdjacentHTML('beforeend', %1)" syntaxCss

  idxRef <- liftIO (newIORef 0)

  let renderState i = renderHtml (states !! i) (roots !! i) (canonicalKeys !! i)

  -- Definicja __applyState raz, na starcie. FLIP: zmierz stare rect-y
  -- elementów z data-key, zmień innerHTML, dla elementów z tym samym
  -- data-key co wcześniej policz delta i animuj transform od starej do
  -- nowej pozycji; nowe (bez starego rect-u) animuj fade-in.
  let setCounter i = void $ element counter # set UI.text ("slajd " ++ show (i + 1) ++ " / " ++ show (length states))

  runFunction $ ffi applyStateJs
  runFunction $ ffi "document.getElementById('code').innerHTML = %1" (renderState 0)
  setCounter 0

  on UI.keydown body $ \code -> do
    i <- liftIO (readIORef idxRef)
    let next
          | code == 39 && i < length states - 1 = Just (i + 1)   -- ArrowRight
          | code == 37 && i > 0                 = Just (i - 1)   -- ArrowLeft
          | otherwise                            = Nothing
    case next of
      Nothing -> pure ()
      Just j  -> do
        liftIO (writeIORef idxRef j)
        runFunction $ ffi "window.__applyState(%1)" (renderState j)
        setCounter j

applyStateJs :: String
applyStateJs = unlines
  [ "window.__applyState = function(html) {"
  , "  var container = document.getElementById('code');"
  , "  var oldEls = container.querySelectorAll('[data-key]');"
  , "  var oldRects = {};"
  , "  oldEls.forEach(function(el) {"
  , "    oldRects[el.dataset.key] = el.getBoundingClientRect();"
  , "  });"
  -- jakie klucze przetrwają do nowego stanu? (parsujemy html offscreen, bez
  -- wstawiania do dokumentu, tylko po to żeby poznać zbiór kluczy)
  , "  var probe = document.createElement('div');"
  , "  probe.innerHTML = html;"
  , "  var newKeys = {};"
  , "  probe.querySelectorAll('[data-key]').forEach(function(el) { newKeys[el.dataset.key] = true; });"
  -- usunięte: sklonuj STARY element (PRZED wymianą innerHTML, bo inaczej nie
  -- będzie czego klonować), zapamiętaj -- wkleimy je do containera PO
  -- swapie (append, nie nadpisze nowej treści), żeby dziedziczyły
  -- font/line-height z #code i mogły fade-outować na starej pozycji
  -- (fixed), zamiast po prostu zniknąć razem ze starym innerHTML.
  , "  var ghosts = [];"
  , "  oldEls.forEach(function(el) {"
  , "    var key = el.dataset.key;"
  , "    if (!newKeys[key]) {"
  , "      var rect = oldRects[key];"
  , "      var ghost = el.cloneNode(true);"
  , "      ghost.style.position = 'fixed';"
  , "      ghost.style.left = rect.left + 'px';"
  , "      ghost.style.top = rect.top + 'px';"
  , "      ghost.style.margin = '0';"
  , "      ghost.style.transform = '';"
  , "      ghost.style.transition = 'none';"
  , "      ghost.style.opacity = '1';"
  , "      ghost.style.zIndex = '-1';"
  , "      ghost.style.pointerEvents = 'none';"
  , "      ghosts.push(ghost);"
  , "    }"
  , "  });"
  , "  container.innerHTML = html;"
  , "  ghosts.forEach(function(ghost) {"
  , "    container.appendChild(ghost);"   -- PO swapie -- dziedziczy styl z #code, nie wywala nowej treści
  , "    ghost.getBoundingClientRect();"
  , "    requestAnimationFrame(function() {"
  , "      requestAnimationFrame(function() {"
  , "        ghost.style.transition = 'opacity 400ms ease';"
  , "        ghost.style.opacity = '0';"
  , "      });"
  , "    });"
  , "    setTimeout(function() { ghost.remove(); }, 450);"
  , "  });"
  , "  container.querySelectorAll('[data-key]').forEach(function(el) {"
  , "    var key = el.dataset.key;"
  , "    var old = oldRects[key];"
  , "    if (old) {"
  , "      var now = el.getBoundingClientRect();"
  , "      var dx = old.left - now.left;"
  , "      var dy = old.top - now.top;"
  , "      if (dx || dy) {"
  , "        el.style.transition = 'none';"
  , "        el.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';"
  , "        el.getBoundingClientRect();"   -- wymuś reflow, żeby invert się napewno namalowal
  , "        requestAnimationFrame(function() {"
  , "          requestAnimationFrame(function() {"   -- 2x rAF: pewność że poprzednia ramka zdążyła się wymalować
  , "            el.style.transition = 'transform 400ms ease';"
  , "            el.style.transform = '';"
  , "          });"
  , "        });"
  , "      }"
  , "    } else {"
  , "      el.style.opacity = '0';"
  , "      el.getBoundingClientRect();"
  , "      requestAnimationFrame(function() {"
  , "        requestAnimationFrame(function() {"
  , "          el.style.transition = 'opacity 400ms ease';"
  , "          el.style.opacity = '1';"
  , "        });"
  , "      });"
  , "    }"
  , "  });"
  , "};"
  ]

-- | Dla pozycji 'i' w sekwencji stanów: treeId (w drzewie stanu i) -> stabilny
-- string-key, ten sam dla danego "logicznego tokenu" niezależnie od stanu.
-- 'matchings !! i' to 'match (roots!!i) (roots!!(i+1))' -- id1 (roots!!i) ->
-- id2 (roots!!(i+1)). Liczymy od ostatniego stanu (bez dokąd dalej chainować)
-- w stronę pierwszego, jawnie po indeksie -- żadnego 'reverse'+zip na dwóch
-- listach naraz, bo to łatwo rozjechać o jeden (i tak było).
buildCanonicalKeys :: [Tree] -> [Matching] -> [Map.Map Int String]
buildCanonicalKeys roots matchings = map keysAt [0 .. n - 1]
  where
    n = length roots

    -- Fallback dla niezmatchowanego węzła MUSI zawierać indeks stanu 'i' --
    -- treeId to mały int liczony od zera NIEZALEŻNIE w każdym stanie, więc
    -- samo "k" ++ show treeId potrafi się przypadkiem zderzyć z kluczem
    -- jakiegoś niezwiązanego tokenu z innego stanu w tym samym łańcuchu.
    fallback :: Int -> Int -> String
    fallback i rawId = "k" ++ show i ++ "_" ++ show rawId

    keysAt :: Int -> Map.Map Int String
    keysAt i
      | i == n - 1 = Map.fromList [ (treeId t, fallback i (treeId t)) | t <- flatten (roots !! i) ]
      | otherwise  =
          let laterKeys  = keysAt (i + 1)
              m          = matchings !! i
              keyFor t   = case Map.lookup (treeId t) m of
                Just id2 -> Map.findWithDefault (fallback i (treeId t)) id2 laterKeys
                Nothing  -> fallback i (treeId t)
          -- każdy węzeł stanu 'i' dostaje wpis (nie tylko te, co są w 'm'),
          -- żeby renderHtml nigdy nie musiało samo zgadywać fallbacku.
          in Map.fromList [ (treeId t, keyFor t) | t <- flatten (roots !! i) ]

-- | Zrenderuj kod jako string HTML: fragmenty tekstu między tokenami jako
-- zwykły tekst (nieanimowany), liście drzewa jako <span data-key=...> gdzie
-- key to kanoniczny identyfikator danego tokenu (ten sam w obu stanach, jeśli
-- token jest zmatchowany) -- to po nim JS rozpoznaje "to ten sam element".
renderHtml :: BS.ByteString -> Tree -> Map.Map Int String -> String
renderHtml src root keys = go 0 (sortOn treeStart leaves)
  where
    leaves = filter (null . treeChildren) (flatten root)

    go pos [] = escape (slice pos (fromIntegral (BS.length src)))
    go pos (t : ts) =
      let s = fromIntegral (treeStart t)
          e = fromIntegral (treeEnd t)
          gap = escape (slice pos s)
          key = Map.findWithDefault ("k" ++ show (treeId t)) (treeId t) keys
          cls = tokenClass (treeLabel t)
          tok = printf "<span data-key=\"%s\" class=\"%s\" style=\"display:inline-block\">%s</span>"
                       key cls (escape (slice s e)) :: String
      in gap ++ tok ++ go e ts

    slice a b = BC.unpack (BS.take (b - a) (BS.drop a src))

    escape = concatMap esc
      where
        esc '<' = "&lt;"
        esc '>' = "&gt;"
        esc '\n' = "<br>"
        esc c = [c]

-- | 'treeLabel' to typ węzła z gramatyki tree-sitter -- dla słów kluczowych
-- i named-nodes to symboliczna nazwa ("identifier", "number", "return"...),
-- dla anonimowych leafów (operatory, nawiasy) to literalnie sam tekst tokenu
-- ("(", "=", "+"...). To wystarcza do prostej klasyfikacji bez tabeli
-- symboli konkretnej gramatyki.
tokenClass :: String -> String
tokenClass label
  | label `Set.member` keywords                 = "tok-keyword"
  | label `elem` ["number", "string", "true", "false", "null", "undefined"] = "tok-builtin"
  | label == "type_identifier"                  = "tok-type"
  | label == "property_identifier"              = "tok-property"
  | label == "identifier"                       = "tok-ident"
  | label == "comment"                           = "tok-comment"
  | all (not . isAlpha) label                   = "tok-punct"
  | otherwise                                    = "tok-plain"
  where
    keywords = Set.fromList
      [ "function", "return", "const", "let", "var", "for", "if", "else"
      , "interface", "export", "import", "from", "of", "new", "class"
      , "extends", "implements", "type", "public", "private", "protected"
      , "readonly", "static", "async", "await", "in", "instanceof", "typeof"
      ]

-- | Klasy kolorów wstrzykiwane raz do <head>, w stylu ciemnego motywu edytora.
syntaxCss :: String
syntaxCss = unlines
  [ "<style>"
  , "  body { background: #1e1e2e; margin: 0; }"
  , "  .tok-keyword  { color: #c678dd; }"
  , "  .tok-ident    { color: #e5e9f0; }"
  , "  .tok-property { color: #61afef; }"
  , "  .tok-type     { color: #e5c07b; }"
  , "  .tok-builtin  { color: #d19a66; }"
  , "  .tok-comment  { color: #5c6370; font-style: italic; }"
  , "  .tok-punct    { color: #6b7385; }"
  , "  .tok-plain    { color: #abb2bf; }"
  , "</style>"
  ]
