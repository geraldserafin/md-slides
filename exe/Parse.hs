{-# LANGUAGE OverloadedStrings #-}
-- | Adapter tree-sitter -> 'GumTree.Tree'. Jedyne miejsce w projekcie, które
-- wie o FFI/konkretnych gramatykach. Dodanie kolejnego języka: zwenduj jego
-- C sources do cbits/<jezyk>/, dopisz tu foreign import + wpis w 'langFromTag'
-- i 'grammarFor', dopisz c-sources/include-dirs w .cabal.
module Parse (Lang (..), langFromTag, parseOne, parseTwo) where

import qualified TreeSitter as TS
import Control.Monad.Trans.Maybe (maybeToExceptT)
import Control.Monad.Trans.Except (runExceptT)
import Control.Monad.Trans.Class (lift)
import Foreign (Ptr)
import Foreign.C.ConstPtr (ConstPtr(ConstPtr))
import TreeSitter (Language)
import Control.Exception (ErrorCall(ErrorCall), throwIO)
import Data.IORef
import Data.Traversable (forM)
import Control.Monad ((<=<))
import qualified Data.ByteString as BS
import qualified Data.ByteString.Char8 as BC
import qualified Data.Text as T

import GumTree (Tree (..))

data Lang = TypeScript | Cpp deriving (Eq, Show)

-- | Mapuje tag języka z fence code-blocka (markdown) na 'Lang'. 'Nothing'
-- = nie mamy gramatyki dla tego języka (strona wołająca powinna wtedy
-- potraktować blok jako statyczny tekst, nie animowany kod).
langFromTag :: T.Text -> Maybe Lang
langFromTag t = case T.toLower t of
  "ts"         -> Just TypeScript
  "typescript" -> Just TypeScript
  "cpp"        -> Just Cpp
  "c++"        -> Just Cpp
  "cxx"        -> Just Cpp
  _            -> Nothing

foreign import ccall unsafe "tree_sitter_typescript"
  tree_sitter_typescript :: Ptr Language

foreign import ccall unsafe "tree_sitter_cpp"
  tree_sitter_cpp :: Ptr Language

grammarFor :: Lang -> Ptr Language
grammarFor TypeScript = tree_sitter_typescript
grammarFor Cpp        = tree_sitter_cpp

-- | 'src' to oryginalny tekst, z którego ten konkretny Node pochodzi --
-- potrzebny żeby wyciąć tekst liścia do 'treeText' (patrz komentarz w
-- 'GumTree.Tree' czemu to jest ważne dla hasha).
freeze :: BS.ByteString -> TS.Node -> IO Tree
freeze src root = newIORef 0 >>= \counter -> go counter root
  where
    go counter node = do
      myId <- readIORef counter
      writeIORef counter (myId + 1)

      label <- TS.nodeTypeAsString node
      start <- TS.nodeStartByte node
      end   <- TS.nodeEndByte node
      n     <- TS.nodeChildCount node
      kids  <- if n > 0 then forM [0 .. n - 1] (go counter <=< TS.nodeChild node)
                        else pure []

      let text = if n == 0
                   then BC.unpack (BS.take (fromIntegral (end - start)) (BS.drop (fromIntegral start) src))
                   else ""

      return Tree { treeId = myId
                  , treeLabel = label
                  , treeText = text
                  , treeStart = start
                  , treeEnd = end
                  , treeChildren = kids
                  }

setupParser :: Lang -> IO TS.Parser
setupParser lang = do
  result <- runExceptT $ maybeToExceptT (ErrorCall "Failed to setup the parser") $ do
    parser <- lift TS.parserNew
    True   <- lift $ TS.parserSetLanguage parser =<< TS.unsafeToLanguage (ConstPtr (grammarFor lang))
    return parser
  either throwIO pure result

-- | Sparsuj jeden snippet.
parseOne :: Lang -> BS.ByteString -> IO Tree
parseOne lang s = do
  parser <- setupParser lang
  result <- runExceptT $ maybeToExceptT (ErrorCall "Failed to parse the code") $ do
    Just t <- lift $ TS.parserParseByteString parser Nothing s
    return t
  t <- either throwIO pure result
  freeze s =<< TS.treeRootNode t

-- | Sparsuj dwa snippety (tym samym parserem, niezależnie od siebie) --
-- muszą być tym samym językiem (diffowanie między-językowe nie ma sensu).
parseTwo :: Lang -> BS.ByteString -> BS.ByteString -> IO (Tree, Tree)
parseTwo lang s1 s2 = do
  parser <- setupParser lang
  result <- runExceptT $ maybeToExceptT (ErrorCall "Failed to parse the code") $ do
    Just t1 <- lift $ TS.parserParseByteString parser Nothing s1
    Just t2 <- lift $ TS.parserParseByteString parser Nothing s2
    return (t1, t2)
  (t1, t2) <- either throwIO pure result

  r1 <- freeze s1 =<< TS.treeRootNode t1
  r2 <- freeze s2 =<< TS.treeRootNode t2

  return (r1, r2)
