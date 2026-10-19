{-# LANGUAGE OverloadedStrings #-}
-- | Konsola prezentera jako osobny TUI (brick/vty) w terminalu, bordered
-- panels jak w lazygit. Żyje w osobnym wątku (forkIO) -- SDL musi zostać
-- na głównym wątku (twardy wymóg na macOS/Cocoa), więc to TUI jest tym
-- co jest "gościem". Komunikacja jednokierunkowa przez BChan: SdlViewer
-- wysyła nowy stan przy każdej nawigacji, TUI tylko się przerysowuje.
module Presenter
  ( PresenterState (..)
  , PresenterEvent (..)
  , newPresenterChannel
  , pushPresenterState
  , quitPresenter
  , runPresenter
  ) where

import Brick
import Brick.BChan (BChan, newBChan, writeBChan)
import Brick.Widgets.Border (borderWithLabel, hBorder)
import Brick.Widgets.Center (hCenter)
import qualified Graphics.Vty as V
import Graphics.Vty.CrossPlatform (mkVty)
import qualified Data.Text as T
import Control.Concurrent.MVar (MVar, putMVar)
import Control.Exception (catch, finally, SomeException)
import System.IO (hPutStrLn, stderr)

data PresenterState = PresenterState
  { psSlideNo   :: Int
  , psSlideTot  :: Int
  , psStepNo    :: Int
  , psStepTot   :: Int
  , psTitle     :: T.Text
  , psNotes     :: [T.Text]
  , psNextTitle :: Maybe T.Text
  , psNextNotes :: [T.Text]
  }

data PresenterEvent = UpdateState PresenterState | QuitPresenter

data Name = Name deriving (Eq, Ord, Show)

titleAttr, statusAttr, hintAttr :: AttrName
titleAttr  = attrName "title"
statusAttr = attrName "status"
hintAttr   = attrName "hint"

newPresenterChannel :: IO (BChan PresenterEvent)
newPresenterChannel = newBChan 16

pushPresenterState :: BChan PresenterEvent -> PresenterState -> IO ()
pushPresenterState chan s = writeBChan chan (UpdateState s)

quitPresenter :: BChan PresenterEvent -> IO ()
quitPresenter chan = writeBChan chan QuitPresenter

-- | Odpalane w forkIO. 'doneVar' wypełniany po tym jak vty naprawdę
-- posprząta terminal (customMain wrócił) -- wołający czeka na to przed
-- zamknięciem całego procesu, inaczej terminal może zostać w rozjechanym
-- stanie (raw mode bez przywrócenia).
-- 'finally' gwarantuje że 'doneVar' ZAWSZE się wypełni, nawet jak vty padnie
-- (np. brak prawdziwego TTY -- terminal przekierowany do pliku/pipe'a).
-- Bez tego wołający (SdlViewer) zawiesiłby się na 'takeMVar' w nieskończoność
-- (GHC łapie to jako "BlockedIndefinitelyOnMVar" i ubija CAŁY proces --
-- SDL też, mimo że to tylko konsola prezentera nie wystartowała).
runPresenter :: BChan PresenterEvent -> MVar () -> PresenterState -> IO ()
runPresenter chan doneVar initial = go `catch` onFail `finally` putMVar doneVar ()
  where
    go = do
      let buildVty = mkVty V.defaultConfig
      initialVty <- buildVty
      _ <- customMain initialVty buildVty (Just chan) app initial
      pure ()

    onFail :: SomeException -> IO ()
    onFail e = hPutStrLn stderr
      ("[presenter] konsola prezentera nie wystartowala (" ++ show e
       ++ ") -- prawdopodobnie brak prawdziwego terminala. Samo okno slajdow dziala dalej.")

app :: App PresenterState PresenterEvent Name
app = App
  { appDraw = drawUI
  , appChooseCursor = neverShowCursor
  , appHandleEvent = handleEvent
  , appStartEvent = pure ()
  , appAttrMap = const (attrMap V.defAttr
      [ (titleAttr, fg V.cyan `V.withStyle` V.bold)
      , (statusAttr, fg V.yellow)
      , (hintAttr, fg V.brightBlack)
      ])
  }

handleEvent :: BrickEvent Name PresenterEvent -> EventM Name PresenterState ()
handleEvent (AppEvent (UpdateState s)) = put s
handleEvent (AppEvent QuitPresenter)   = halt
handleEvent (VtyEvent (V.EvKey (V.KChar 'q') [])) = halt
handleEvent (VtyEvent (V.EvKey V.KEsc []))         = halt
handleEvent _ = pure ()

drawUI :: PresenterState -> [Widget Name]
drawUI s =
  [ vBox
      [ hCenter (withAttr statusAttr (str statusLine))
      , hBox
          [ borderWithLabel (withAttr titleAttr (str "BIEZACY SLAJD")) (padAll 1 curPane)
          , borderWithLabel (withAttr titleAttr (str "NASTEPNY SLAJD")) (padAll 1 nextPane)
          ]
      , hBorder
      , hCenter (withAttr hintAttr (str "strzalki w oknie graficznym zmieniaja slajd  --  q / Esc: zamknij konsole"))
      ]
  ]
  where
    statusLine = "SLAJD " ++ show (psSlideNo s) ++ "/" ++ show (psSlideTot s)
               ++ "    krok " ++ show (psStepNo s) ++ "/" ++ show (psStepTot s)

    curPane = vBox
      [ strWrapT (psTitle s)
      , str " "
      , vBox (map strWrapT (psNotes s))
      ]

    nextPane = case psNextTitle s of
      Nothing -> str "(to ostatni slajd)"
      Just t  -> vBox
        [ strWrapT t
        , str " "
        , vBox (map strWrapT (psNextNotes s))
        ]

    strWrapT = strWrap . T.unpack
