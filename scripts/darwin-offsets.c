// Prints the struct offsets and constants used by core/platform/darwinFfi.js, from the macOS SDK
// headers. Rerun after an SDK change and compare with the tables at the top of darwinFfi.js:
//   clang -o /tmp/darwin-offsets scripts/darwin-offsets.c && /tmp/darwin-offsets
#include <stdio.h>
#include <stddef.h>
#include <libproc.h>
#include <sys/proc_info.h>
#include <sys/sysctl.h>
#include <mach/mach.h>
#include <pwd.h>
#include <mach/mach_time.h>
#define O(t, f) printf("  %-34s %zu\n", #t "." #f, offsetof(t, f))
#define S(t) printf("%-36s %zu\n", "sizeof(" #t ")", sizeof(t))
#define C(c) printf("%-36s %ld\n", #c, (long)(c))
int main(void) {
    C(PROC_PIDTASKALLINFO); C(PROC_PIDTBSDINFO); C(PROC_PIDT_SHORTBSDINFO); C(PROC_PIDLISTFDS); C(PROC_PIDFDSOCKETINFO);
    C(PROX_FDTYPE_SOCKET); C(SOCKINFO_TCP); C(TSI_S_LISTEN); C(AF_INET); C(AF_INET6); C(INI_IPV4); C(INI_IPV6);
    C(SIDL); C(SRUN); C(SSLEEP); C(SSTOP); C(SZOMB); C(HOST_VM_INFO64); C(HOST_VM_INFO64_COUNT); C(PROC_PIDPATHINFO_MAXSIZE);
    S(struct proc_taskallinfo); S(struct proc_bsdinfo); S(struct proc_taskinfo); S(struct proc_bsdshortinfo);
    O(struct proc_taskallinfo, pbsd); O(struct proc_taskallinfo, ptinfo);
    O(struct proc_bsdinfo, pbi_status); O(struct proc_bsdinfo, pbi_pid); O(struct proc_bsdinfo, pbi_ppid); O(struct proc_bsdinfo, pbi_uid);
    O(struct proc_bsdinfo, pbi_comm); O(struct proc_bsdinfo, pbi_name); O(struct proc_bsdinfo, pbi_start_tvsec); O(struct proc_bsdinfo, pbi_start_tvusec);
    O(struct proc_taskinfo, pti_resident_size); O(struct proc_taskinfo, pti_total_user); O(struct proc_taskinfo, pti_total_system); O(struct proc_taskinfo, pti_numrunning);
    O(struct proc_bsdshortinfo, pbsi_ppid); O(struct proc_bsdshortinfo, pbsi_status); O(struct proc_bsdshortinfo, pbsi_comm); O(struct proc_bsdshortinfo, pbsi_uid);
    S(struct proc_fdinfo); O(struct proc_fdinfo, proc_fd); O(struct proc_fdinfo, proc_fdtype);
    S(struct socket_fdinfo); O(struct socket_fdinfo, psi); O(struct socket_info, soi_family); O(struct socket_info, soi_kind); O(struct socket_info, soi_proto);
    O(struct tcp_sockinfo, tcpsi_ini); O(struct tcp_sockinfo, tcpsi_state);
    O(struct in_sockinfo, insi_lport); O(struct in_sockinfo, insi_vflag); O(struct in_sockinfo, insi_laddr);
    S(vm_statistics64_data_t); O(vm_statistics64_data_t, free_count); O(vm_statistics64_data_t, active_count); O(vm_statistics64_data_t, inactive_count);
    O(vm_statistics64_data_t, wire_count); O(vm_statistics64_data_t, speculative_count); O(vm_statistics64_data_t, purgeable_count);
    O(vm_statistics64_data_t, external_page_count); O(vm_statistics64_data_t, internal_page_count); O(vm_statistics64_data_t, compressor_page_count);
    S(struct xsw_usage); O(struct xsw_usage, xsu_total); O(struct xsw_usage, xsu_used);
    O(struct passwd, pw_name);
    mach_timebase_info_data_t tb; mach_timebase_info(&tb); printf("%-36s %u/%u\n", "mach_timebase (this machine)", tb.numer, tb.denom);
    return 0;
}
