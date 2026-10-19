{-# LANGUAGE OverloadedStrings #-}
module Main (main) where

import qualified Data.ByteString as BS
import qualified Data.ByteString.Char8 as BC

import GumTree (Tree (..), Edit (..), match, editScript, collapseEdits)
import Parse (Lang (TypeScript), parseTwo)

main :: IO ()
main = do
  let s1 = "function f(a: number, b: number) { return a + b; }"
  let s2 = "function f(a: number, b: number, c: number) { return a + b; }"

  (r1, r2) <- parseTwo TypeScript s1 s2

  mapM_ (putStrLn . prettyEdit s1 s2) (collapseEdits r1 r2 (editScript r1 r2 (match r1 r2)))

prettyEdit :: BS.ByteString -> BS.ByteString -> Edit -> String
prettyEdit s1 s2 e = case e of
  Delete t   -> "- usunięto     " ++ describe s1 t
  Insert t   -> "+ dodano       " ++ describe s2 t
  Update a b -> "~ zmiana typu  " ++ treeLabel a ++ " -> " ++ treeLabel b ++ "  (" ++ describe s1 a ++ ")"
  Move a b   -> "> przeniesiono " ++ describe s1 a ++ "  ->  " ++ describe s2 b
  where
    describe src t = treeLabel t ++ " \"" ++ BC.unpack (slice src t) ++ "\""
    slice src t = BS.take (fromIntegral (treeEnd t - treeStart t)) (BS.drop (fromIntegral (treeStart t)) src)
