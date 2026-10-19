{-# LANGUAGE OverloadedStrings #-}

module SlideDoc (Slide (..), Section (..), TextItem (..), loadSlides) where

import qualified Data.ByteString as BS
import qualified Data.Text as T
import qualified Data.Text.Encoding as TE
import Data.List (sort)
import System.Directory (listDirectory)
import System.FilePath ((</>), takeExtension, takeDirectory, isAbsolute)
import qualified Text.Pandoc as P
import Text.Pandoc.Shared (stringify)

-- | Jeden element tekstu/treści PRZED kodem danej sekcji, w oryginalnej
-- kolejności z markdowna -- nagłówek, akapit albo obrazek (` ![alt](plik) `
-- jako jedyna treść akapitu). Ścieżka obrazka jest już rozwiązana względem
-- katalogu pliku .md (więc dalsze warstwy nie muszą znać 'dir').
data TextItem
  = TIHeading T.Text
  | TIText T.Text
  | TIImage FilePath T.Text
  deriving Show

data Section = Section
  { sectionText    :: [TextItem]       -- tekst/obrazki PRZED kodem tej sekcji
  , sectionClasses :: [T.Text]         -- surowe klasy z fence'a (język + opcje), [] jeśli bez kodu
  , sectionCode    :: [BS.ByteString]  -- kolejne stany kodu do animacji (może być [])
  } deriving Show

data Slide = Slide
  { slideSections :: [Section]
  , slideNotes    :: [T.Text]
  } deriving Show

loadSlides :: FilePath -> IO [Slide]
loadSlides dir = do
  names <- sort . filter ((== ".md") . takeExtension) <$> listDirectory dir
  mapM (loadSlide . (dir </>)) names

loadSlide :: FilePath -> IO Slide
loadSlide path = do
  raw <- TE.decodeUtf8 <$> BS.readFile path
  let opts = P.def { P.readerExtensions = P.pandocExtensions }
  P.Pandoc _ blocks <- P.runIOorExplode (P.readMarkdown opts raw)
  let (rawBlocks, notes) = foldr step ([], []) blocks
  pure (Slide (groupSections rawBlocks) notes)
  where
    baseDir = takeDirectory path

    resolveImg p = if isAbsolute p then p else baseDir </> p

    -- Akapit złożony z JEDNEGO obrazka (` ![alt](plik) ` na własnej linii)
    -- -> traktowany jako obrazek, nie tekst (stringify by zgubił ścieżkę).
    step b (cs, ns) = case b of
      P.RawBlock (P.Format "html") raw
        | "<!--" `T.isPrefixOf` T.strip raw -> (cs, stripComment raw : ns)
      P.Header _ _ inlines -> (RawItem (TIHeading (stringify inlines)) : cs, ns)
      P.CodeBlock (_, classes, _) code -> (RawCode classes code : cs, ns)
      P.Para [P.Image _ alt (imgPath, _)] ->
        (RawItem (TIImage (resolveImg (T.unpack imgPath)) (stringify alt)) : cs, ns)
      -- Samodzielny obrazek na własnej linii -- przez rozszerzenie
      -- 'implicit_figures' (włączone w 'pandocExtensions') Pandoc zamienia go
      -- w 'Figure', nie 'Para [Image]' jak w starszych wersjach.
      P.Figure _ _ [P.Plain [P.Image _ alt (imgPath, _)]] ->
        (RawItem (TIImage (resolveImg (T.unpack imgPath)) (stringify alt)) : cs, ns)
      _ -> (RawItem (TIText (T.strip (stringify b))) : cs, ns)

    stripComment raw =
      T.strip . dropSuffix "-->" . dropPrefix "<!--" $ T.strip raw
    dropPrefix p t = if p `T.isPrefixOf` t then T.drop (T.length p) t else t
    dropSuffix s t = if s `T.isSuffixOf` t then T.dropEnd (T.length s) t else t

-- Pośredni typ przed pogrupowaniem w sekcje.
data RawBlock' = RawItem TextItem | RawCode [T.Text] T.Text

groupSections :: [RawBlock'] -> [Section]
groupSections = go []
  where
    go pending []
      | null pending = []
      | otherwise    = [Section (reverse pending) [] []]
    go pending (RawItem (TIText t) : rest)
      | T.null t  = go pending rest
      | otherwise = go (TIText t : pending) rest
    go pending (RawItem item : rest) = go (item : pending) rest
    go pending (RawCode classes code : rest) =
      let (same, rest') = span (isSameClasses classes) rest
          codes = code : [c | RawCode _ c <- same]
      in Section (reverse pending) classes (map TE.encodeUtf8 codes) : go [] rest'
      where
        isSameClasses c (RawCode c' _) = c' == c
        isSameClasses _ _              = False
