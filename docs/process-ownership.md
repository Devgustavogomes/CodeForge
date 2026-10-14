# Execution process ownership

ProcessExecutor reports serializable ProcessRecord evidence through onProcessRecord.
The observer runs synchronously before launch, after launch and identity discovery,
and when the parent actually exits. A timeout records a diagnostic; it does not
assert that the parent or its subprocesses terminated. Both exec (preparation
commands) and spawn (agents, hooks, and conflict resolution) support reporting.

Supply intentName, taskId when applicable, kind, cwd, and an observer from
ExecutionStateRepository.processReporter(intentName). The application container
also supplies a central repository observer to its default executor. Runner and
hook contexts forward explicit observers. Records are retained in execution state,
including records for removed tasks, and identifying evidence cannot be rewritten.
Do not serialize environment variables or stdin into ownership records.

After restart, use inspectEnvironment with taskId or cwd to inspect all prior
launches for an environment. Use safeToReuse to authorize replacement or worktree
cleanup; parent completion and an exit code alone are insufficient. An empty
history returns unknown, rather than asserting that legacy executions are dead.
reconcileProcesses settles interrupted running tasks and conflict resolution
stages, preserves approval for completed tasks, and retains recovery diagnostics.
The scheduler returns a recovery result when it has no local completion promises.
No task concurrency limit is imposed.

Inspection uses host and boot identity, process creation identity, and observed
ancestry. Linux additionally scans inherited CODEFORGE_PROCESS_TOKEN values in
/proc to find descendants after parent exit. PID matches with different creation
identities are unrelated processes. Windows uses CIM CreationDate and ParentProcessId;
it follows ancestry only from identified live processes and remembers observed
subprocess creation identities. Killing a Windows shell does not establish that
its descendants have exited.

Windows cannot exclude unobserved orphan descendants using process snapshots alone.
If no owned process is visible but descendant ownership cannot be established,
inspection returns unknown with preservation and inspection instructions. A verified
host reboot excludes all prior processes. Access denied, unsupported platforms,
and incomplete inspection also preserve conservative occupancy diagnostics.
Unknown occupancy must block automatic reuse until ownership can be established.
