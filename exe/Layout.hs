-- | Pozycjonowanie leafów drzewa w monospace gridzie (row, col) na podstawie
-- oryginalnego źródła. Agnostyczne co do GUI -- SDL/cokolwiek innego tylko
-- mnoży (row, col) przez (lineHeight, charWidth), żeby dostać piksele.
module Layout (GridPos, layoutLeaves) where

import qualified Data.ByteString as BS
import Data.List (sortOn)
import Data.Word (Word8)

import GumTree (Tree (..), flatten)

type GridPos = (Int, Int) -- (row, col), 0-indeksowane

newline :: Word8
newline = 10

-- | Dla każdego leafa: jego pozycja w gridzie. Liczone przez symulację
-- kursora -- idziemy po leafach w kolejności występowania, "gap" (tekst
-- między końcem poprzedniego a startem tego leafa, czyli whitespace/wciecia)
-- tylko przesuwa kursor, nie jest renderowany jako glify.
layoutLeaves :: BS.ByteString -> Tree -> [(Tree, GridPos)]
layoutLeaves src root = go 0 0 0 (sortOn treeStart leaves)
  where
    leaves = filter (null . treeChildren) (flatten root)

    go _ _ _ [] = []
    go pos row col (t : ts) =
      let s    = fromIntegral (treeStart t)
          gap  = BS.take (s - pos) (BS.drop pos src)
          (row', col') = advance row col gap
          tokLen = fromIntegral (treeEnd t - treeStart t)
      in (t, (row', col')) : go (fromIntegral (treeEnd t)) row' (col' + tokLen) ts

    advance row col gap = case BS.elemIndices newline gap of
      []   -> (row, col + BS.length gap)
      idxs -> (row + length idxs, BS.length gap - (last idxs + 1))
