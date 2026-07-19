on run argv
    if (count of argv) is 0 then return
    set launcherTTY to item 1 of argv

    -- Let the launcher shell finish before asking Terminal to close its tab.
    delay 0.5

    tell application "Terminal"
        repeat with terminalWindow in windows
            repeat with terminalTab in tabs of terminalWindow
                if tty of terminalTab is launcherTTY then
                    if (count of tabs of terminalWindow) is 1 then
                        close terminalWindow
                    else
                        close terminalTab
                    end if
                    return
                end if
            end repeat
        end repeat
    end tell
end run
