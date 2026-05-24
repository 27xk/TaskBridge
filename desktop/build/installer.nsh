!macro customUnInstall
  RMDir /r "$APPDATA\TaskBridge"
  RMDir /r "$APPDATA\taskbridge-desktop"
  RMDir /r "$LOCALAPPDATA\TaskBridge"
  RMDir /r "$LOCALAPPDATA\taskbridge-desktop"
!macroend
