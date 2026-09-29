# Product Requirements Document: Kestrel

## 1. Overview
Kestrel is a terminal-based application for macOS that combines live system monitoring with process lifecycle management in a single tool.

## 2. Problem Statement
Existing terminal tools address system monitoring (e.g., `htop`) and process management (e.g., `pm2`) as separate concerns. There is no lightweight tool that provides both live system visibility and control over self-managed processes within one interface.

## 3. Objectives
- Provide a live view of system-wide CPU and memory usage.
- Display and allow interaction with the full system process table.
- Allow users to launch, monitor, and automatically recover custom processes.

## 4. Target Users
Developers who work primarily in the terminal and want a single tool for observing system state and managing long-running processes during development.

## 5. Scope

### In Scope
- Live CPU and memory usage display.
- System process table with sorting, filtering, and selection.
- Ability to terminate or change the priority of a selected process.
- Ability to launch custom processes and monitor their status, uptime, and logs.
- Automatic restart of crashed managed processes.

### Out of Scope
- Linux and Windows support.
- Remote or networked monitoring.
- Persistence of managed-process configuration across restarts.

## 6. Key Features

| Feature | Description |
|---|---|
| System Monitor | Live CPU/memory usage and process table |
| Process Control | Terminate or reprioritize any system process |
| Process Manager | Launch and supervise custom processes |
| Auto-Recovery | Automatic restart of crashed managed processes |
| Live Logs | Real-time log output for managed processes |

## 7. Success Criteria
- System stats and process list update in real time without noticeable lag.
- A managed process that crashes is automatically restarted without manual intervention.
- A selected system process can be terminated or reprioritized directly from the interface.

## 8. Platform
macOS, terminal-based interface.

## 9. Timeline
Estimated development window: 2 weeks.
