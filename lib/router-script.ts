type RouterScriptInput = {
  rbName: string;
  sstpUser: string;
  sshUsername: string;
  sshPassword: string;
};

function routerOsString(value: string) {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

export function buildRouterScript(input: RouterScriptInput) {
  const rbName = routerOsString(input.rbName);
  const sstpUser = routerOsString(input.sstpUser);
  const sshUsername = routerOsString(input.sshUsername);
  const sshPassword = routerOsString(input.sshPassword);

  return `# C3 Protect Remote
# Script individual para ${rbName}
# A senha SSH abaixo e exclusiva deste MikroTik.

/snmp community add addresses=172.17.17.0/32,172.18.18.0/32 name=c3support
/snmp set enabled=yes trap-community=c3support

###### CLIENTE ######
:local client "${rbName}"
:local user "${sstpUser}"
:local network "10.0.0.0/8"

###### ADDRESS LIST ######
/ip firewall address-list add address=0.0.0.0/8 list=bogons
/ip firewall address-list add address=127.0.0.0/8 list=bogons
/ip firewall address-list add address=169.254.0.0/16 list=bogons
/ip firewall address-list add address=192.0.0.0/24 list=bogons
/ip firewall address-list add address=192.0.2.0/24 list=bogons
/ip firewall address-list add address=198.18.0.0/15 list=bogons
/ip firewall address-list add address=198.51.100.0/24 list=bogons
/ip firewall address-list add address=203.0.113.0/24 list=bogons
/ip firewall address-list add address=224.0.0.0/4 list=bogons
/ip firewall address-list add address=240.0.0.0/4 list=bogons
/ip firewall address-list add address=255.255.255.255 list=bogons
/ip firewall address-list add address=a.ntp.br list=NTP_SERVERS
/ip firewall address-list add address=b.ntp.br list=NTP_SERVERS
/ip firewall address-list add address=170.80.147.48 list=WHITELIST
/ip firewall address-list add address=brasil.c3support.com.br list=WHITELIST
/ip firewall address-list add address=vpn.c3support.com.br list=WHITELIST
/ip firewall address-list add address=zg.c3support.com.br list=WHITELIST
/ip firewall address-list add address=224.0.0.5 list=OSPF_MULTICAST
/ip firewall address-list add address=224.0.0.6 list=OSPF_MULTICAST
/ip firewall address-list add address=172.18.18.0 list=LIBERADOS
/ip firewall address-list add address=172.17.17.0 list=LIBERADOS
/ip firewall address-list add address=172.18.18.0 list=SUPORTE
/ip firewall address-list add address=172.17.17.0 list=SUPORTE
/ip firewall address-list add address=\$network list=SUPORTE
/ip firewall address-list add address=zg.c3support.com.br list=WHITELIST_SNMP
/ip firewall address-list add address=172.18.18.0 list=WHITELIST_SNMP
/ip firewall address-list add address=172.17.17.0 list=WHITELIST_SNMP
/ip firewall address-list add address=\$network list=LOCAL_SUBNET

/log warning message="Adddress list ready"

###### SUPPORT VPN ######
/interface sstp-client add authentication=chap,mschap1,mschap2 comment="== VPN-C3Support" connect-to=brasil.c3support.com.br disabled=no name=sstp-c3support password=c3support port=1443 profile=default-encryption user=\$user

###### INTERFACE LIST ######
/interface list add name=ISP
/interface list add name=LAN
/interface list member add interface=ether1 list=ISP
/interface list member add interface=ether5 list=LAN

###### INPUT ######
/ip firewall filter add action=accept chain=input comment="===== ACCEPT ESTABLISHED | RELATED | UNTRACKED" connection-state=established,related,untracked
/ip firewall filter add action=accept chain=input comment="===== ACCEPT SNMP" dst-port=161 protocol=udp src-address-list=WHITELIST_SNMP
/ip firewall filter add action=accept chain=input comment="===== ACCEPT OSPF" in-interface-list=!ISP protocol=ospf
/ip firewall filter add action=accept chain=input comment="===== ACCEPT ICMP | 30ps" limit=30,5:packet protocol=icmp
/ip firewall filter add action=accept chain=input comment="===== ACCEPT WINBOX" dst-port=4040 protocol=tcp src-address-list=SUPORTE
/ip firewall filter add action=accept chain=input comment="===== ACCEPT SSH" dst-port=22333 protocol=tcp src-address-list=SUPORTE
/ip firewall filter add action=accept chain=input comment="===== ACCEPT WEBFIG" dst-port=1080 protocol=tcp src-address-list=SUPORTE
/ip firewall filter add action=accept chain=input comment="===== ACCEPT DNS" dst-port=53 in-interface-list=!ISP protocol=tcp src-address-list=LOCAL_SUBNET
/ip firewall filter add action=accept chain=input dst-port=53 in-interface-list=!ISP protocol=udp src-address-list=LOCAL_SUBNET
/ip firewall filter add action=drop chain=input comment="===== ANTI DDOS DNS" dst-port=53 in-interface-list=ISP protocol=tcp
/ip firewall filter add action=drop chain=input dst-port=53 in-interface-list=ISP protocol=udp
/ip firewall filter add action=accept chain=input comment="===== ACCEPT ALL FROM SUPPORT" in-interface-list=!ISP src-address-list=LIBERADOS
/ip firewall filter add action=accept chain=input comment="===== ACCEPT WIREGUARD" dst-port=14231 protocol=udp
/ip firewall filter add action=drop chain=input comment="===== DROP INVALIDS" connection-state=invalid
/ip firewall filter add action=drop chain=input comment="===== ANTI ICMP SMURF" dst-address-type=broadcast protocol=icmp
/ip firewall filter add action=add-src-to-address-list address-list=PORT_SCANNERS address-list-timeout=1w chain=input comment="===== PORTSCAN" in-interface-list=ISP protocol=tcp psd=21,3s,3,1 src-address-list=!WHITELIST
/ip firewall filter add action=add-src-to-address-list address-list=PORT_SCANNERS address-list-timeout=1w chain=input in-interface-list=ISP protocol=udp psd=21,3s,3,1 src-address-list=!WHITELIST
/ip firewall filter add action=add-src-to-address-list address-list=PORT_SCANNERS address-list-timeout=1w chain=input dst-port=22,23,80,2000,8728,8729 in-interface-list=ISP protocol=tcp src-address-list=!WHITELIST
/ip firewall filter add action=add-src-to-address-list address-list=PORT_SCANNERS address-list-timeout=1w chain=input dst-port=22,23,80,2000,8728,8729 in-interface-list=ISP protocol=udp src-address-list=!WHITELIST
/ip firewall filter add action=drop chain=input comment="===== DROP ALL THE REST"

/log warning message="Firewall filter input ready"

###### RAW ######
/ip firewall raw add action=accept chain=prerouting comment="==Enable For Transparent Firewall" disabled=yes
/ip firewall raw add action=notrack chain=prerouting comment="==No Track Ospf Protocol" protocol=ospf
/ip firewall raw add action=drop chain=prerouting comment="==Drop Portscanners List" src-address-list=PORT_SCANNERS
/ip firewall raw add action=accept chain=prerouting comment="==Accept Ospf Multicast" in-interface-list=!ISP src-address-list=OSPF_MULTICAST
/ip firewall raw add action=drop chain=prerouting comment="==Drop Bogons Comming From ISP" in-interface-list=ISP src-address-list=bogons
/ip firewall raw add action=drop chain=prerouting comment="==Anti-DDoS NTP" in-interface-list=ISP protocol=udp src-address-list=!NTP_SERVERS src-port=123
/ip firewall raw add action=drop chain=prerouting comment="==Anti-SPAM Port 25" protocol=tcp src-port=25
/ip firewall raw add action=drop chain=prerouting protocol=udp src-port=25
/ip firewall raw add action=drop chain=prerouting dst-port=25 protocol=tcp
/ip firewall raw add action=drop chain=prerouting dst-port=25 protocol=udp
/ip firewall raw add action=drop chain=prerouting comment="==Anti-DDoS Comming From ISP" dst-port=19-23,69,111,135-139,1433,1900,2049,5353,5900,9034,11211 in-interface-list=ISP protocol=tcp
/ip firewall raw add action=drop chain=prerouting comment="==Anti-DDoS Comming From ISP" dst-port=19-23,69,111,135-139,1433,1900,2049,5353,5900,9034,11211 in-interface-list=ISP protocol=udp
/ip firewall raw add action=drop chain=prerouting port=0 protocol=udp
/ip firewall raw add action=jump chain=prerouting comment="==Jump To ICMP Control" jump-target=icmp-control protocol=icmp
/ip firewall raw add action=accept chain=icmp-control comment="==Echo Reply" icmp-options=0:0 limit=100,5:packet protocol=icmp
/ip firewall raw add action=accept chain=icmp-control comment="==Net Unreachable" icmp-options=3:0 protocol=icmp
/ip firewall raw add action=accept chain=icmp-control comment="==Host Unreachable" icmp-options=3:1 protocol=icmp
/ip firewall raw add action=accept chain=icmp-control comment="==Protocol Unreachable" icmp-options=3:2 protocol=icmp
/ip firewall raw add action=accept chain=icmp-control comment="==Port Unreachable" icmp-options=3:3 protocol=icmp
/ip firewall raw add action=accept chain=icmp-control comment="==Fragmentation Needed" icmp-options=3:4 protocol=icmp
/ip firewall raw add action=accept chain=icmp-control comment="==Echo Request" icmp-options=8:0 limit=100,5:packet protocol=icmp
/ip firewall raw add action=accept chain=icmp-control comment="==Time Exceeded" icmp-options=11:0-255 protocol=icmp
/ip firewall raw add action=drop chain=icmp-control comment="==Drop Other ICMP" protocol=icmp
/ip firewall raw add action=jump chain=prerouting comment="==TCP Filter" jump-target=bad_tcp protocol=tcp
/ip firewall raw add action=drop chain=bad_tcp comment="==TCP Flag Filter" protocol=tcp tcp-flags=!fin,!syn,!rst,!ack
/ip firewall raw add action=drop chain=bad_tcp protocol=tcp tcp-flags=fin,syn
/ip firewall raw add action=drop chain=bad_tcp protocol=tcp tcp-flags=fin,rst
/ip firewall raw add action=drop chain=bad_tcp protocol=tcp tcp-flags=fin,!ack
/ip firewall raw add action=drop chain=bad_tcp protocol=tcp tcp-flags=fin,urg
/ip firewall raw add action=drop chain=bad_tcp protocol=tcp tcp-flags=syn,rst
/ip firewall raw add action=drop chain=bad_tcp protocol=tcp tcp-flags=rst,urg
/ip firewall raw add action=drop chain=bad_tcp port=0 protocol=tcp

/log warning message="Firewall raw ready"

###### AJUSTES GERAIS ######
/tool mac-server set allowed-interface-list=LAN
/tool mac-server mac-winbox set allowed-interface-list=LAN
/ip settings set max-neighbor-entries=2048 rp-filter=loose tcp-syncookies=yes
/ip ssh set strong-crypto=yes
/ip neighbor discovery-settings set discover-interface-list=!ISP
/ip firewall connection tracking set tcp-established-timeout=12h
/ip service set ftp disabled=yes
/ip service set ssh disabled=no address=172.18.18.0/32,172.17.17.0/32 port=22333
/ip service set telnet disabled=yes
/ip service set www address=172.18.18.0/32,172.17.17.0/32 disabled=no port=1080
/ip service set api disabled=yes
/ip service set api-ssl disabled=yes
/ip service set winbox port=4040
/tool bandwidth-server set authenticate=no enabled=no
/ip dns set max-udp-packet-size=512 servers=8.8.8.8,8.8.4.4
/system ntp client set enabled=yes
/system ntp client servers add address=a.ntp.br
/system ntp client servers add address=b.ntp.br
/system clock set time-zone-autodetect=no time-zone-name=America/Sao_Paulo
/system identity set name=\$client

###### USUARIOS C3 SUPPORT ######
/user add name=c3.yan password=c3@support group=full
/user group add name=zabbix policy=ssh,read,test,!local,!telnet,!ftp,!reboot,!write,!policy,!winbox,!password,!web,!sniff,!sensitive,!api,!romon,!rest-api
/user add address=172.18.18.0/32,172.17.17.0/32 group=zabbix name=c3.zabbix password="0}qj/4E44TY}"

###### USUARIO EXCLUSIVO C3 PROTECT REMOTE ######
:local remoteUser "${sshUsername}"
:local remotePass "${sshPassword}"
:if ([:len [/user find where name=\$remoteUser]] = 0) do={
  /user add address=172.18.18.0/32,172.17.17.0/32 group=full name=\$remoteUser password=\$remotePass
} else={
  /user set [find where name=\$remoteUser] address=172.18.18.0/32,172.17.17.0/32 group=full password=\$remotePass
}

/user remove admin

###### BACKUP ######
/system script add dont-require-permissions=yes name=backup_ftp owner=c3.yan policy=ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon source={
    :local ftpServer "ftp.c3suporte.com.br";
    :local ftpPort 22;
    :local ftpUser "mikrotikbkp";
    :local ftpPass "3yPZEohL.AD@6iP@";
    :local maxTentativas 3;
    :global n8nUrl "https://n8n.c3support.com.br/webhook/e31cfd70-c118-41d6-bc9f-55d67c6a6bbb";
    :global stage;
    :global status;
    :global file;
    :global msg;

    :local sendN8N do={
        :global n8nUrl;
        :global stage;
        :global status;
        :global file;
        :global msg;
        :local rbName [/system identity get name];
        :local date [/system clock get date];
        :local hora [/system clock get time];
        :local json ("{\\"router\\":\\"" . \$rbName . "\\",\\"date\\":\\"" . \$date . "\\",\\"time\\":\\"" . \$hora . "\\",\\"stage\\":\\"" . \$stage . "\\",\\"status\\":\\"" . \$status . "\\",\\"file\\":\\"" . \$file . "\\",\\"message\\":\\"" . \$msg . "\\"}");
        :do {
            /tool fetch url=\$n8nUrl mode=https http-method=post http-data=\$json http-header-field="Content-Type: application/json" check-certificate=no keep-result=no;
        } on-error={
            :log warning "Falha ao enviar webhook para N8N";
        };
    };

    :local d [/system clock get date];
    :local data "";
    :if ([:find \$d "-"] != nil) do={
        :set data \$d;
    } else={
        :if ([:find \$d "/"] != nil) do={
            :local firstChar [:pick \$d 0 1];
            :if ((\$firstChar>="0") && (\$firstChar<="9")) do={
                :local day [:pick \$d 0 2];
                :local mm [:pick \$d 3 5];
                :local yr [:pick \$d 6 10];
                :set data (\$yr . "-" . \$mm . "-" . \$day);
            } else={
                :local mon [:pick \$d 0 3];
                :local day [:pick \$d 4 6];
                :local yr [:pick \$d 7 11];
                :local mm "";
                :if (\$mon="jan") do={:set mm "01"};
                :if (\$mon="feb") do={:set mm "02"};
                :if (\$mon="mar") do={:set mm "03"};
                :if (\$mon="apr") do={:set mm "04"};
                :if (\$mon="may") do={:set mm "05"};
                :if (\$mon="jun") do={:set mm "06"};
                :if (\$mon="jul") do={:set mm "07"};
                :if (\$mon="aug") do={:set mm "08"};
                :if (\$mon="sep") do={:set mm "09"};
                :if (\$mon="oct") do={:set mm "10"};
                :if (\$mon="nov") do={:set mm "11"};
                :if (\$mon="dec") do={:set mm "12"};
                :set data (\$yr . "-" . \$mm . "-" . \$day);
            };
        } else={
            :set data \$d;
        };
    };

    :local rb [/system identity get name];
    :local baseBackup (\$rb . "-Backup-" . \$data);
    :local baseExport (\$rb . "-Export-" . \$data);
    :local backupFile (\$baseBackup . ".backup");
    :local exportFile (\$baseExport . ".rsc");
    :local exportSuccess false;
    :local backupSuccess false;

    :log warning "==========================================";
    :log warning ("Iniciando rotina de backup: " . \$rb);
    :log warning "==========================================";
    :log warning ("Gerando backup: " . \$backupFile);
    /system backup save name=\$baseBackup;
    :log warning ("Backup gerado: " . \$backupFile);
    :log warning ("Gerando export: " . \$exportFile);
    /export terse show-sensitive file=\$baseExport;
    :log warning ("Export gerado: " . \$exportFile);
    :delay 10s;

    :local tentativaExport 1;
    :while ((\$tentativaExport <= \$maxTentativas) && (\$exportSuccess = false)) do={
        :log warning ("EXPORT tentativa " . \$tentativaExport . "/3");
        :do {
            /tool fetch address=\$ftpServer mode=sftp port=\$ftpPort user=\$ftpUser password=\$ftpPass src-path=\$exportFile dst-path=("inbox/" . \$exportFile) upload=yes idle-timeout=1m duration=10m;
            :set exportSuccess true;
            :log warning ("EXPORT enviado com sucesso: " . \$exportFile);
        } on-error={
            :log error ("Falha no envio do EXPORT - tentativa " . \$tentativaExport . "/3");
        };
        :if ((\$exportSuccess = false) && (\$tentativaExport < \$maxTentativas)) do={
            :log warning "Aguardando 15 segundos antes de tentar novamente";
            :delay 15s;
        };
        :set tentativaExport (\$tentativaExport + 1);
    };

    :if (\$exportSuccess = true) do={
        :set stage "export";
        :set status "success";
        :set file \$exportFile;
        :set msg "SFTP upload concluido";
        \$sendN8N;
    } else={
        :set stage "export";
        :set status "error";
        :set file \$exportFile;
        :set msg "SFTP upload falhou apos 3 tentativas";
        \$sendN8N;
    };

    :delay 5s;
    :local tentativaBackup 1;
    :while ((\$tentativaBackup <= \$maxTentativas) && (\$backupSuccess = false)) do={
        :log warning ("BACKUP tentativa " . \$tentativaBackup . "/3");
        :do {
            /tool fetch address=\$ftpServer mode=sftp port=\$ftpPort user=\$ftpUser password=\$ftpPass src-path=\$backupFile dst-path=("inbox/" . \$backupFile) upload=yes idle-timeout=1m duration=10m;
            :set backupSuccess true;
            :log warning ("BACKUP enviado com sucesso: " . \$backupFile);
        } on-error={
            :log error ("Falha no envio do BACKUP - tentativa " . \$tentativaBackup . "/3");
        };
        :if ((\$backupSuccess = false) && (\$tentativaBackup < \$maxTentativas)) do={
            :log warning "Aguardando 15 segundos antes de tentar novamente";
            :delay 15s;
        };
        :set tentativaBackup (\$tentativaBackup + 1);
    };

    :if (\$backupSuccess = true) do={
        :set stage "backup";
        :set status "success";
        :set file \$backupFile;
        :set msg "SFTP upload concluido";
        \$sendN8N;
    } else={
        :set stage "backup";
        :set status "error";
        :set file \$backupFile;
        :set msg "SFTP upload falhou apos 3 tentativas";
        \$sendN8N;
    };

    :if (\$exportSuccess = true) do={
        :log warning "Upload EXPORT confirmado. Removendo arquivo local.";
        /file remove \$exportFile;
    } else={
        :log error ("EXPORT NAO enviado. Arquivo sera mantido localmente: " . \$exportFile);
    };

    :if (\$backupSuccess = true) do={
        :log warning "Upload BACKUP confirmado. Removendo arquivo local.";
        /file remove \$backupFile;
    } else={
        :log error ("BACKUP NAO enviado. Arquivo sera mantido localmente: " . \$backupFile);
    };

    :if ((\$exportSuccess = true) && (\$backupSuccess = true)) do={
        :log warning "==========================================";
        :log warning "ROTINA DE BACKUP FINALIZADA COM SUCESSO";
        :log warning "==========================================";
    } else={
        :log error "==========================================";
        :log error "ROTINA FINALIZADA COM FALHA DE UPLOAD";
        :log error "ARQUIVOS COM FALHA FORAM MANTIDOS";
        :log error "==========================================";
    };
}

/system scheduler add interval=1w name=agendamento_backup on-event=backup_ftp policy=ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon start-date=2026-01-30 start-time=22:00:00

/log warning message="C3 Script Finished"
`;
}

export function buildSshRotationScript(input: {
  rbName: string;
  sshUsername: string;
  sshPassword: string;
}) {
  const rbName = routerOsString(input.rbName);
  const sshUsername = routerOsString(input.sshUsername);
  const sshPassword = routerOsString(input.sshPassword);

  return `# C3 Protect Remote
# Rotacao da credencial SSH de ${rbName}

:local remoteUser "${sshUsername}"
:local remotePass "${sshPassword}"

/ip service set ssh disabled=no port=22333
:if ([:len [/user find where name=\$remoteUser]] = 0) do={
  /user add address=172.18.18.0/32,172.17.17.0/32 group=full name=\$remoteUser password=\$remotePass
} else={
  /user set [find where name=\$remoteUser] address=172.18.18.0/32,172.17.17.0/32 group=full password=\$remotePass
}

/log warning message="C3 Protect Remote: credencial SSH atualizada"
`;
}

export function buildDeviceUpdateScript(input: {
  rbName: string;
  sstpUser: string;
}) {
  const rbName = routerOsString(input.rbName);
  const sstpUser = routerOsString(input.sstpUser);
  return `# C3 Protect Remote
# Sincronizacao dos dados do equipamento

/system identity set name="${rbName}"
:if ([:len [/interface sstp-client find where name="sstp-c3support"]] > 0) do={
  /interface sstp-client set [find where name="sstp-c3support"] user="${sstpUser}"
}

/log warning message="C3 Protect Remote: cadastro sincronizado"
`;
}
