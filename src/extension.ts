import * as vscode from "vscode";

let ws: WebSocket | null = null;
let KeyStrokeCount = 0;
let isTracking = false;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );

  statusBarItem.text = `Keystrokes: 0`;
  statusBarItem.show();

  connectWebSocket();

  const textChangeDisposable = vscode.workspace.onDidChangeTextDocument(
    (event) => {
      if (isTracking && event.contentChanges.length > 0) {
        const newKeyStroke = event.contentChanges.reduce((sum, change) => {
          return sum + change.text.length;
        }, 0);

        KeyStrokeCount += newKeyStroke;
        updateStatusBar();
        sendKeyStrokeData();
      }
    }
  );

  //  command to reset keystroke count
  const resetCommand = vscode.commands.registerCommand(
    "extension.resetKeystrokes",
    () => {
      KeyStrokeCount = 0;
      updateStatusBar();
      vscode.window.showInformationMessage("Keystroke count reset");
    }
  );

  //  command to toggle tracking
  const toggleTrackingCommand = vscode.commands.registerCommand(
    "extension.toggleTracking",
    () => {
      isTracking = !isTracking;
      updateStatusBar();
      vscode.window.showInformationMessage(
        `Keystroke tracking ${isTracking ? "enabled" : "disabled"}`
      );
    }
  );

  //  command to manually start tracking (useful when no workspace)
  const startTrackingCommand = vscode.commands.registerCommand(
    "extension.startTracking",
    () => {
      if (!isTracking) {
        isTracking = true;
        updateStatusBar();
        vscode.window.showInformationMessage("Keystroke tracking started");
      }
    }
  );

  context.subscriptions.push(
    textChangeDisposable,
    statusBarItem,
    resetCommand,
    toggleTrackingCommand,
    startTrackingCommand
  );
}

export function deactivate() {
  if (ws) {
    ws.close();
  }
}

const sendKeyStrokeData = () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    const activeEditor = vscode.window.activeTextEditor;

    // Get document info even without workspace
    const documentInfo = activeEditor?.document;
    const fileName = documentInfo?.fileName || "untitled";
    const languageId = documentInfo?.languageId || "plaintext";

    // Extract just the filename from full path for privacy/simplicity
    const shortFileName =
      fileName.includes("/") || fileName.includes("\\")
        ? fileName.split(/[/\\]/).pop() || "untitled"
        : fileName;

    ws.send(
      JSON.stringify({
        type: "keystroke_update",
        keyStrokes: KeyStrokeCount,
        timeStamp: Date.now(),
        language: languageId,
        fileName: shortFileName,
        fullPath: fileName,
        workspaceName: vscode.workspace.name || "No Workspace",
        hasWorkspace: !!(
          vscode.workspace.workspaceFolders &&
          vscode.workspace.workspaceFolders.length > 0
        ),
        hasActiveEditor: !!activeEditor,
        isUntitled: documentInfo?.isUntitled || false,
      })
    );
  }
};

const connectWebSocket = () => {
  ws = new WebSocket(`ws://localhost:8080`);

  ws.onopen = () => {
    console.log("WebSocket connected");
    // Start tracking immediately when connected, regardless of workspace
    isTracking = true;
    updateStatusBar();

    // Send initial connection message
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "connection_established",
          timeStamp: Date.now(),
          hasWorkspace: !!(
            vscode.workspace.workspaceFolders &&
            vscode.workspace.workspaceFolders.length > 0
          ),
          workspaceName: vscode.workspace.name || "No Workspace",
        })
      );
    }
  };

  ws.onclose = (event) => {
    console.log(
      `WebSocket connection closed (code: ${event.code}), reconnecting...`
    );
    isTracking = false;
    updateStatusBar();
    setTimeout(connectWebSocket, 5000);
  };

  ws.onerror = (wsError) => {
    console.error("WebSocket error:", wsError);
    isTracking = false;
    updateStatusBar();
  };
};

const updateStatusBar = () => {
  const trackingStatus = isTracking ? "●" : "○";
  const workspaceStatus =
    vscode.workspace.workspaceFolders &&
    vscode.workspace.workspaceFolders.length > 0
      ? ""
      : " (No WS)";
  statusBarItem.text = `${trackingStatus} Keystrokes: ${KeyStrokeCount}${workspaceStatus}`;
};
