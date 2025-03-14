import {
  List,
  Icon,
  Color,
  confirmAlert,
  ActionPanel,
  Action,
  open,
  showToast,
  Toast,
  showHUD,
} from '@raycast/api';
import { useEffect, useState } from 'react';
import execa from 'execa';

interface BatteryInfo {
  percentage: string;
  status: string;
  remainingTime: string;
  wattage: string;
  title: string;
  subtitle: string;
  lowPowerMode: boolean;
  lowPowerModeSetting: string;
}

function formatRemainingTime(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  if (hours === 0) {
    return `${minutes}m`;
  } else if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h${minutes}m`;
}

export default function Command() {
  const [batteryInfo, setBatteryInfo] = useState<BatteryInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchBatteryInfo() {
    try {
      const batteryResult = await execa('pmset', ['-g', 'batt']);
      const powerResult = await execa('pmset', ['-g', 'ac']);
      const lowPowerResult = await execa('pmset', ['-g', 'custom']);

      const lowPowerMatches =
        lowPowerResult.stdout.match(/lowpowermode\s+(\d+)/g) || [];
      const lowPowerBattery =
        lowPowerMatches.length > 0 && lowPowerMatches[0]
          ? lowPowerMatches[0].includes('1')
          : false;
      const lowPowerAC =
        lowPowerMatches.length > 1 ? lowPowerMatches[1].includes('1') : false;

      let lowPowerModeSetting = 'Never';
      if (lowPowerBattery && lowPowerAC) {
        lowPowerModeSetting = 'Always';
      } else if (lowPowerBattery) {
        lowPowerModeSetting = 'Only on Battery';
      } else if (lowPowerAC) {
        lowPowerModeSetting = 'Only on Power Adapter';
      }

      const batteryInfo = batteryResult.stdout;
      const powerInfo = powerResult.stdout;

      const percentageMatch = batteryInfo.match(/([0-9]+)%/);
      const statusMatch = batteryInfo.match(
        /(charging|discharging|charged|finishing charge)/i
      );
      const remainingTimeMatch = batteryInfo.match(/([0-9]+:[0-9]+)/);
      const wattageMatch = powerInfo.match(/Wattage\s*=\s*([0-9.]+)/);

      if (!percentageMatch || !statusMatch) {
        throw new Error('Failed to parse battery information');
      }

      const percentage = percentageMatch[0];
      const status = statusMatch[0].toLowerCase();
      const remainingTime = remainingTimeMatch ? remainingTimeMatch[0] : '';
      const wattage = wattageMatch ? wattageMatch[1] + 'W' : '';

      let wattageInfo = '';
      if (status === 'charging' || status === 'charged') {
        wattageInfo = wattage;
      }

      let remainingInfo = '';
      if (remainingTime && status !== 'charged') {
        remainingInfo = formatRemainingTime(remainingTime);
      }

      let title = '';
      if (wattageInfo) {
        title = `${percentage} - ${status} (${wattageInfo})`;
      } else {
        title = `${percentage} - ${status}`;
      }

      let subtitle = '';
      if (status === 'charged') {
        subtitle = 'Fully charged';
      } else if (status === 'charging' && remainingInfo) {
        subtitle = `${remainingInfo} until fully charged`;
      } else if (status === 'discharging' && remainingInfo) {
        subtitle = `${remainingInfo} remaining`;
      }

      setBatteryInfo({
        percentage,
        status,
        remainingTime,
        wattage,
        title,
        subtitle,
        lowPowerMode: lowPowerBattery || lowPowerAC,
        lowPowerModeSetting,
      });
    } catch (err) {
      console.error('Error fetching battery info:', err);
      setError('Failed to fetch battery information');
    } finally {
      setIsLoading(false);
    }
  }

  const toggleLowPowerMode = async (
    mode: 'Never' | 'Always' | 'Only on Battery' | 'Only on Power Adapter'
  ) => {
    if (!batteryInfo) return;

    try {
      let newState = {
        Never: { b: '0', c: '0' },
        Always: { b: '1', c: '1' },
        'Only on Battery': { b: '1', c: '0' },
        'Only on Power Adapter': { b: '0', c: '1' },
      }[mode];

      await execa('sudo', ['/usr/bin/pmset', '-b', 'lowpowermode', newState.b]);
      await execa('sudo', ['/usr/bin/pmset', '-c', 'lowpowermode', newState.c]);

      await fetchBatteryInfo();

      showToast({
        title: `Low Power Mode set to ${mode}`,
        style: Toast.Style.Success,
      });
    } catch (err) {
      showHUD(
        'Touch ID is required to toggle Low Power Mode. Please change it manually in System Preferences.'
      );
      await open('x-apple.systempreferences:com.apple.preference.battery');
    }
  };

  useEffect(() => {
    fetchBatteryInfo();
    const interval = setInterval(fetchBatteryInfo, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusDetails = () => {
    if (!batteryInfo) return { icon: Icon.Battery, color: Color.PrimaryText };

    const percentage = parseInt(batteryInfo.percentage);

    if (batteryInfo.status === 'charging') {
      return { icon: Icon.BatteryCharging, color: Color.Yellow };
    } else if (batteryInfo.status === 'charged') {
      return { icon: Icon.Battery, color: Color.Green };
    } else if (percentage <= 20) {
      return { icon: Icon.Battery, color: Color.Red };
    } else if (percentage <= 50) {
      return { icon: Icon.Battery, color: Color.Orange };
    } else {
      return { icon: Icon.Battery, color: Color.PrimaryText };
    }
  };

  const statusDetails = getStatusDetails();

  return (
    <List isLoading={isLoading}>
      {error ? (
        <List.Item
          title="Error"
          subtitle={error}
          icon={{ source: Icon.Warning, tintColor: Color.Red }}
        />
      ) : batteryInfo ? (
        <>
          <List.Item
            title={batteryInfo.title}
            subtitle={batteryInfo.subtitle}
            icon={{
              source: statusDetails.icon,
              tintColor: statusDetails.color,
            }}
          />

          <List.Item
            title="Low Power Mode"
            subtitle={batteryInfo.lowPowerModeSetting}
            icon={Icon.Power}
            actions={
              <ActionPanel>
                <Action.Push
                  title="View Details"
                  target={
                    <List>
                      <List.Item
                        title="Current Mode"
                        subtitle={batteryInfo?.lowPowerModeSetting || 'Unknown'}
                        icon={Icon.Info}
                      />
                      <List.Item
                        title="Set to Never"
                        actions={
                          <ActionPanel>
                            <Action
                              title="Set to Never"
                              onAction={() => toggleLowPowerMode('Never')}
                            />
                          </ActionPanel>
                        }
                      />
                      <List.Item
                        title="Set to Always"
                        actions={
                          <ActionPanel>
                            <Action
                              title="Set to Always"
                              onAction={() => toggleLowPowerMode('Always')}
                            />
                          </ActionPanel>
                        }
                      />
                      <List.Item
                        title="Set to Only on Battery"
                        actions={
                          <ActionPanel>
                            <Action
                              title="Set to Only on Battery"
                              onAction={() =>
                                toggleLowPowerMode('Only on Battery')
                              }
                            />
                          </ActionPanel>
                        }
                      />
                      <List.Item
                        title="Set to Only on Power Adapter"
                        actions={
                          <ActionPanel>
                            <Action
                              title="Set to Only on Power Adapter"
                              onAction={() =>
                                toggleLowPowerMode('Only on Power Adapter')
                              }
                            />
                          </ActionPanel>
                        }
                      />
                    </List>
                  }
                />
              </ActionPanel>
            }
          />
        </>
      ) : null}
    </List>
  );
}
