import { List, Icon, Color } from '@raycast/api';
import { useEffect, useState } from 'react';
import execa from 'execa';

interface BatteryInfo {
  percentage: string;
  status: string;
  remainingTime: string;
  wattage: string;
  title: string;
  subtitle: string;
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

  useEffect(() => {
    async function fetchBatteryInfo() {
      try {
        // Get battery information
        const batteryResult = await execa('pmset', ['-g', 'batt']);
        const powerResult = await execa('pmset', ['-g', 'ac']);

        const batteryInfo = batteryResult.stdout;
        const powerInfo = powerResult.stdout;

        // Extract relevant information
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
        let status = statusMatch[0].toLowerCase();
        const remainingTime = remainingTimeMatch ? remainingTimeMatch[0] : '';
        const wattage = wattageMatch ? wattageMatch[1] + 'W' : '';

        // Update charging status
        if (status === 'charging') {
          status = 'Charging';
        } else if (status === 'discharging') {
          status = 'Discharging';
        } else if (status === 'charged' || status === 'finishing charge') {
          status = 'Charged';
        }

        let wattageInfo = '';
        if (status === 'Charging') {
          wattageInfo = wattage;
        } else if (status === 'Discharging') {
          wattageInfo = '';
        }

        // Format the remaining time if it exists
        let remainingInfo = '';
        if (remainingTime && status !== 'Charged') {
          remainingInfo = formatRemainingTime(remainingTime);
        }

        // Format the output title
        let title = '';
        if (wattageInfo) {
          title = `${percentage} - ${status} (${wattageInfo})`;
        } else {
          title = `${percentage} - ${status}`;
        }

        // Format the subtitle
        let subtitle = '';
        if (status === 'Charging' && remainingInfo) {
          subtitle = `${remainingInfo} until fully charged`;
        } else if (status === 'Charged') {
          subtitle = 'Fully charged';
        } else {
          subtitle = `${remainingInfo} remaining`;
        }

        setBatteryInfo({
          percentage,
          status,
          remainingTime,
          wattage,
          title,
          subtitle,
        });
      } catch (err) {
        console.error('Error fetching battery info:', err);
        setError('Failed to fetch battery information');
      } finally {
        setIsLoading(false);
      }
    }

    fetchBatteryInfo();
    // Refresh battery info every 30 seconds
    const interval = setInterval(fetchBatteryInfo, 30000);
    return () => clearInterval(interval);
  }, []);

  // Determine icon and color based on battery status
  const getStatusDetails = () => {
    if (!batteryInfo) return { icon: Icon.Battery, color: Color.PrimaryText };

    const percentage = parseInt(batteryInfo.percentage);

    if (batteryInfo.status === 'Charging') {
      return { icon: Icon.BatteryCharging, color: Color.Yellow };
    } else if (batteryInfo.status === 'Charged') {
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
        <List.Item
          title={batteryInfo.title}
          subtitle={batteryInfo.subtitle}
          icon={{ source: statusDetails.icon, tintColor: statusDetails.color }}
          // accessories={[
          //   { text: batteryInfo.status },
          //   {
          //     icon:
          //       batteryInfo.status === 'Charging'
          //         ? Icon.ArrowUp
          //         : Icon.ArrowDown,
          //   },
          // ]}
        />
      ) : null}
    </List>
  );
}
