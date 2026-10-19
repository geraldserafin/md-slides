-- | Każdy podkatalog test/fixtures/<nazwa>/ ma old.<ext>, new.<ext> i expect.txt:
--   M <oldLine> <tekst> <newLine> <tekst>   liść ma być zmatchowany z tym liściem
--   U <oldLine> <tekst> [n]                  liść starego kodu ma zostać bez pary
--   V <newLine> <tekst>                     liść nowego kodu ma zostać bez pary (wstawiony)
--   NOFUNCS                                 żadna definicja funkcji nie może się zmatchować
-- Linie numerowane od 1, tekst = pierwszy liść o tym tekście w danej linii.
module Main (main) where

import Control.Monad (forM, unless)
import qualified Data.ByteString as BS
import qualified Data.Map.Strict as Map
import Data.List (isPrefixOf, sort)
import System.Directory (listDirectory)
import System.Exit (exitFailure)
import System.FilePath (takeBaseName, takeExtension, (</>))

import GumTree
import Parse

fixtures :: FilePath
fixtures = "test/fixtures"

langOf :: FilePath -> Lang
langOf ext = if ext `elem` [".ts", ".tsx"] then TypeScript else Cpp

lineOf :: BS.ByteString -> Tree -> Int
lineOf src t = 1 + BS.count 10 (BS.take (fromIntegral (treeStart t)) src)

findLeaf :: BS.ByteString -> Tree -> Int -> String -> Int -> Maybe Tree
findLeaf src root ln txt nth =
  case drop (nth - 1) [ t | t <- flatten root, null (treeChildren t), treeText t == txt, lineOf src t == ln ] of
    (t : _) -> Just t
    []      -> Nothing

runFixture :: FilePath -> IO [String]
runFixture name = do
  let dir = fixtures </> name
  files <- listDirectory dir
  let pick base = concat [ [dir </> f] | f <- files, takeBaseName f == base, takeExtension f /= ".txt" ] !! 0
      oldP = pick "old"
      newP = pick "new"
  old <- BS.readFile oldP
  new <- BS.readFile newP
  (t1, t2) <- parseTwo (langOf (takeExtension oldP)) old new
  expect <- lines <$> readFile (dir </> "expect.txt")
  let m = match t1 t2
      matchedTo a = Map.lookup (treeId a) m
      nthOf rest = case rest of { (k : _) -> read k; [] -> 1 }
      isFunc t = treeLabel t == "function_definition"
      check l = case words l of
        ("M" : o : ot : n : nt : _) ->
          case (findLeaf old t1 (read o) ot 1, findLeaf new t2 (read n) nt 1) of
            (Just a, Just b) | matchedTo a == Just (treeId b) -> []
            _ -> [name ++ ": expected " ++ l]
        ("U" : o : ot : rest) -> case findLeaf old t1 (read o) ot (nthOf rest) of
          Just a | matchedTo a == Nothing -> []
          _ -> [name ++ ": expected unmatched " ++ l]
        ("V" : n : nt : rest) -> case findLeaf new t2 (read n) nt (nthOf rest) of
          Just b | treeId b `notElem` Map.elems m -> []
          _ -> [name ++ ": expected inserted " ++ l]
        ["NOFUNCS"] -> [ name ++ ": function matched at " ++ show (treeStart a)
                       | a <- flatten t1, isFunc a, Map.member (treeId a) m ]
        _ -> []
  pure (concatMap check (filter (\l -> not (null l) && not ("#" `isPrefixOf` l)) expect))

main :: IO ()
main = do
  names <- sort <$> listDirectory fixtures
  failures <- concat <$> forM names runFixture
  mapM_ putStrLn failures
  putStrLn (show (length names) ++ " fixtures, " ++ show (length failures) ++ " failures")
  unless (null failures) exitFailure
