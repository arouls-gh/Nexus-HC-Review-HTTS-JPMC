window.OFFLINE_RULES = {
  customerName: "Customer",
  checkTemplates: {
    checkBiosGolden: {
      classification: "minor",
      defaultAction:
        "The alternate BIOS functions as a fallback in case the primary BIOS becomes corrupted, fails to boot, or encounters issues during an upgrade. The older version is intentionally preserved as the backup of BIOS for rollback protection. The alternate BIOS cannot be manually configured; it is managed automatically. This can be safely ignored",
      byActivity: {
        "code-upgrade":
          "The alternate BIOS functions as a fallback in case the primary BIOS becomes corrupted, fails to boot, or encounters issues during an upgrade. The older version is intentionally preserved as the backup of BIOS for rollback protection. The alternate BIOS cannot be manually configured; it is managed automatically. This can be safely ignored",
        "smu-upgrade":
          "The alternate BIOS functions as a fallback in case the primary BIOS becomes corrupted, fails to boot, or encounters issues during an upgrade. The older version is intentionally preserved as the backup of BIOS for rollback protection. The alternate BIOS cannot be manually configured; it is managed automatically. This can be safely ignored",
      },
    },
    checkFeature: {
      classification: "minor",
      defaultAction: "Verify unused features and remove",
    },
    checkFwdUtilization: {
      defaultAction:
        "TCAM routes utilization is greater than threshold. Customer to check further if routes needs summarisation / filtering or TCAM carving. Utilization > 90% is subjected to immediate scaling",
    },
    checkLacpTimer: {
      defaultAction:
        "Customer needs to check LACP timers is same as the LACP neighbor using show lacp interface command.",
    },
    checkLoggingMessages: {
      classification: "minor",
      defaultAction:
        "Non impacting with the MW. Only affects the syslog file",
    },
    checkSmuCSCvz65993: {
      defaultAction: "Customer need to check with PE team.",
      byActivity: {
        "code-upgrade":
          "Customer need to check with PE team. Manual check: config ; feature bash ; end ; run bash cat /mnt/pss/bootlogs/current/dmesg | grep CSCvz65993 ; config ; no feature bash ; end ; copy run start.",
      },
    },
    checkCoppPolicyMap: {
      defaultAction:
        "Customer to check if the control plane policy is taking incremental violations or the drop is historical. Default class taking drops is common.",
    },
    checkInterfaceErrors: {
      classification: "major",
      defaultAction:
        "Interfaces are taking errors. Validate if they are incremental or historical. Perform physical checks and reach to Cisco for further assistance.",
    },
    checkActiveSmu: {
      classification: "minor",
      defaultAction:
        "SMU are found in device but not on expected list. Customer to verify with PE Team to keep approved list of patches",
    },
    checkSmuOrder: {
      classification: "major",
      defaultAction:
        "Check on 9K platforms. The SMUs must be on mentioned order. There is no direct stoppage to MW, but recommended to run in order to avoid unexpected impacts.",
    },
    checkVpcStatus: {
      defaultAction: "Customer need to check if expected to down or not.",
    },
    checkPortChannel: {
      defaultAction: "Customer need to check if expected to down or not.",
    },
    checkInterfaceFlap: {
      defaultAction: "Customer need to check.",
    },
    checkIntStatus: {
      classification: "minor",
      defaultAction:
        "Customer to check if the interface status is required to be UP.",
    },
    checkCpuInternal: {
      defaultAction:
        "Customer need to validate again by running show system internal processes cpu and observe whether utilization remains high.",
    },
    checkAdvertisedRoutesBgpPeer: {
      classification: "minor",
      defaultAction:
        "The number of prefixes advertised towards the BGP neighbor is not within the ideal range count. This is not a problem state. It is advised to have a track of BGP sent and received prefixes before and after the activity and compare missing prefixes.",
    },
    checkBgpNeighborsStatus: {
      classification: "major",
      defaultAction: "Verify if all the BGP neighbors are UP in VRF",
    },
    checkBgpProcess: {
      classification: "minor",
      defaultAction:
        "Verify if all required BGP process for all address-family are UP.",
    },
    checkBgpMemory: {
      defaultAction:
        "validate if the number of prefixes in BGP table is under platform limitation. Check which VRF consumes the most memory. verify if excessive received-routes are there from a peer. look for constant route flaps. Get show tech bgp for further analysis. this could be due to legidt scale issue or memory leak. The impact with the MW in inconclusive without deep analysis",
    },
    checkBgpMemLeakAlert: {
      classification: "major",
      defaultAction:
        "BGP is suseptable to have memory leak. Analyse further with show tech bgp logs. The impact with the MW in inconclusive without deep analysis",
    },
    checkCdpErrors: {
      classification: "major",
      defaultAction:
        "CDP checksum errors might cause malformed packets issue with data plane traffic\nVerify further with below below commands if known defect is hit\nshow interface hardware-mappings\nmodule-2# debug hardware internal hom dump a 0 s 1 t tah_hom_mac01_cfg_mcmac0_rxconfig\nstripfcs=0x00000000 >>> dentotes software defect CSCvt97607",
    },
    checkEnvironment: {
      classification: "major",
      defaultAction:
        "Check for healthy PSU and FAN & validate and process HW replacement",
    },
    checkRoutingTableIpv4: {
      classification: "minor",
      defaultAction:
        "does not have dynamically learned IPv4 routes. This does not qualify for a problem. It is advised to check routing table entries from previous backups vs present for comparison.",
    },
    checkSnmpStatus: {
      classification: "minor",
      defaultAction:
        "SNMP requests with incorrect community string is received. Scrutinise with only known SNMP servers with correct community strings. Packet capture for SNMP to find who is sending unknown community.",
    },
    checkSupEpldVersion: {
      classification: "minor",
      defaultAction:
        "Check EPLD version of the mentioned module. Does not affect MW, recommended to run with apt. EPLD version",
    },
    checkLinecardEpldVersion: {
      classification: "minor",
      defaultAction:
        "Check EPLD version of the mentioned module. Does not affect MW, recommended to run with apt. EPLD versions",
    },
    checkArpSummary: {
      classification: "minor",
      defaultAction:
        "Check ARP learnings before and after upgrade as best practice. Incomplete learning cannot be said an issue unless there is no broken L2 path.",
    },
    checkAsicEventsErrors: {
      classification: "major",
      defaultAction:
        "Customer to check if the errors are repeated. This could be due to HW or a HW programming defect. Obtain show tech tah-usd for analysis. Impact with the MW is inconclusive.",
    },
    checkDiagStatus: {
      classification: "show-stopper",
      defaultAction:
        "Module has errors. Need to validate failing diag is a HW or SW issue & process HW replacement if isolated to HW problem. Might affect the upcoming Maintenance Window",
    },
    checkDefaultrouteIpv4: {
      classification: "minor",
      defaultAction:
        "VRFs do not have default route. This may affect the MW where traffic might momentarily experience SPOF and cause routing blackholing with last resort in some vrf. Customer should comapare and decide if this routing is allowed.",
    },
    checkRibConsumption: {
      classification: "major",
      defaultAction:
        "Routing table is consuming high memory. Customer to verify if there is scaling issue / route flaps. Impact with Maintenance Window is inconslusive without deep analysis. High RIB memory consumption is a smoking gun and needs attention.",
    },
    checkNtpPeerStatus: {
      classification: "minor",
      defaultAction:
        "NTP is not synchronised. Switch clock might get affected. Customer to fix the NTP sync as a best practice",
    },
    checkSyslogRemote: {
      classification: "minor",
      defaultAction:
        "Syslog destination is unreachable. Customer to check reachability with IP:PORT of syslog device from the switch, may not imapct the MW",
    },
    checkCpuStatus: {
      defaultAction:
        "CPU is over utilized on certain processes. May affect other process and have chances of affecting MW if left unattended. It's avised to bring CPU of any process under par prior the maintenance window. Collect show tech detail for futher analysis",
    },
    checkCpuMacMgmtCounters: {
      classification: "show-stopper",
      defaultAction:
        "This is an internal interface which will affect management traffic and other traffic to CPU. It's advised to clear the device's internal connection to CPU prior any MW as this might cause unpredictable outcomes during MW",
    },
    checkCpuMacInbandCounters: {
      classification: "major",
      defaultAction:
        "This is an internal interface which control traffic to CPU. It's advised to clear the device's internal connection to CPU prior any MW as this might cause unpredictable outcomes during MW. Collect show tech detail for analysis only if the counts keep incrementing",
    },
    checkBootflashSpace: {
      classification: "major",
      defaultAction:
        "Insufficient space in bootflash: might affect upgrades. It is advised to clear the space prior upgrades. This will not affect other changes such as isolation test and topology changes.",
    },
    checkMacInc: {
      classification: "show-stopper",
      defaultAction:
        "Inconsistent Layer 2 on HW modules.\nLayer 2 forwading might get affected. During a MW, if this switch is in SPOF, which is already experiencing inconsistent layer 2 forwarding might impact production traffic.\nCustomer to validate if the inconsistency is persistant or historical\nIdenytify failing MAC from consistency checker, check for MAC flap, SW vs HW sync defects. Get show tech detail, l2fm for further analysis",
    },
    checkCoppPolicy: {
      classification: "minor",
      defaultAction:
        "Might not affect MW. It follows strict policy which will drop overwhelming CPU packets",
    },
    checkInternalMts: {
      classification: "major",
      defaultAction:
        "MTS message is stuck in the queue. As a best practice, this has tp be cleared prior any MW.\nNot all MTS messages denote problem. This is a smoking gun that needs assesment from TAC engineer. Customer to share the MTS description and show tech for analysis",
    },
    checkCoreFiles: {
      classification: "major",
      defaultAction:
        "Core files were generated. Denoting process crash\nCustomer to share the core files for further analysis. If repeated cores are getting generted.\nImpact on MW cannot be determoned at this stage.",
    },
    checkSsdReadOnly: {
      classification: "show-stopper",
      defaultAction:
        "SSD in read-only state\nThis will affect upgrades. Could be SSD issue which needs replacement. Customer needs to share standard SSD logs set to determine next actions.\nA reload could be workaround in most cases",
    },
    checkSsdStats: {
      classification: "major",
      defaultAction:
        "SSD in error state. This will affect upgrades. Could be SSD issue which needs replacement. Customer needs to share standard SSD logs set to determine next actions.",
    },
    checkSystemReset: {
      classification: "minor",
      defaultAction:
        "Last reset reason does not impact MW.",
    },
    checkModuleModel: {
      classification: "major",
      defaultAction:
        "Module does not have module\nModule without module is considered down. Customer to follow module diagnostics",
    },
    checkVersion: {
      classification: "major",
      defaultAction:
        "Customer to check to move to AS recommended version\nIgnore if you are already planning the device for code upgrade",
    },
    checkBiosVersion: {
      classification: "minor",
      defaultAction:
        "Node is running unexpected BIOS\nBIOS are upgraded with the code upgrade. Device to be scheduled for code upgrade.",
    },
    checkFeatureUtil: {
      classification: "minor",
      defaultAction:
        "Feature utilization on the switch is above scale threshold\nCustomer to check with PE Team to scale with recommended usage",
    },
    checkMemoryInternal: {
      classification: "show-stopper",
      defaultAction:
        "Memory of above 90% is critical and affect the MW if not sorted. Customer to validate the processes consuming memory and share show tech detail for further investigation",
    },
    checkMemoryStatus: {
      classification: "major",
      defaultAction:
        "Customer to monitor if system resource is constantly over utilized",
    },
    checkBfdStatus: {
      classification: "major",
      defaultAction:
        "Customer to check if all BFD enabled interfaces have successfully established sessions\nNeed to validate on both the ends. Ensure IP reachability without loss between peers",
    },
    checkBfdTimers: {
      classification: "minor",
      defaultAction:
        "Does not affect upgrades & migration. Might only affect traffic convergence during protocol isolation\nRecommended to run PE team's suggested timers",
    },
    checkTcamUtilization: {
      classification: "major",
      defaultAction:
        "Customer to validate if the TCAM is used to scale. Customer to check with PE Team for TCAM remediation",
    },
    checkRpmHeapAsPath: {
      classification: "major",
      defaultAction:
        "Customer to validate the ip as-path-access-list and the \"show run rpm\" entries if mismatch is seen. The device is suspectible for known issue. Workaround is to remove and re-apply the the as-path-access-list",
    },
    checkProfilerDeviceNxos: {
      classification: "minor",
      defaultAction:
        "Does not affect the Maintenance Activity",
    },
    checkTrieTiles: {
      classification: "major",
      defaultAction:
        "Any module's overall Trie table utilization is above the specified\nCustomer to check with PE team - Depending on environment routing scale, elevated table utilization may be required. If max-paths are aconfigured, device may need a reload.",
    },
    checkCcForwarding: {
      classification: "major",
      defaultAction:
        "L3 consistency checker is failing. Run the CC manually to check for inconsistent prefixes",
    },
    checkModState: {
      classification: "major",
      defaultAction:
        "Module is unhealthy\nRun diagnostics and validate for SW or HW issue. Customer to share show tech detail for analysis",
    },
    checkL3InterfaceStatus: {
      classification: "major",
      defaultAction:
        "Validate physical and encapsulation checks as the interface is admin UP and line/proto DOWN.",
    },
    checkSsdFirmware: {
      classification: "major",
      defaultAction:
        "Check if device SSD firmware is running a specific version to avoid known issues\nImpact on upgrade activity is inconslusive. Customer to check further",
    },
    checkLogsFib: {
      classification: "major",
      defaultAction:
        "FIB errors are seen in syslog\nCheck latest L3 consistency checker to conclude if FIB errors are occurring",
    },
  },
};
