/**
 * National Weather Service (NWS) Alerts Service
 * Fetches weather alerts for specific locations using the NWS API
 */

export interface WeatherAlert {
  id: string;
  event: string; // e.g., "Tornado Warning", "Severe Thunderstorm Warning"
  headline: string;
  description: string;
  instruction?: string;
  severity: 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown';
  certainty: 'Observed' | 'Likely' | 'Possible' | 'Unlikely' | 'Unknown';
  urgency: 'Immediate' | 'Expected' | 'Future' | 'Past' | 'Unknown';
  areaDesc: string;
  onset: Date;
  expires: Date;
  senderName: string;
  status: 'Actual' | 'Exercise' | 'System' | 'Test' | 'Draft';
  messageType: 'Alert' | 'Update' | 'Cancel';
  category: string;
  geometry?: {
    type: string;
    coordinates: number[][][];
  };
}

export interface AlertsResponse {
  alerts: WeatherAlert[];
  lastFetched: Date;
  location: string;
}

/**
 * Fetches active weather alerts for a given point (latitude, longitude)
 */
export async function fetchAlertsByPoint(
  latitude: number,
  longitude: number
): Promise<AlertsResponse> {
  try {
    const url = `https://api.weather.gov/alerts/active?point=${latitude},${longitude}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'MeshBridgeGUI/1.0 (Emergency Alert System)',
        'Accept': 'application/geo+json',
      },
    });

    if (!response.ok) {
      throw new Error(`NWS API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    const alerts: WeatherAlert[] = data.features.map((feature: any) => ({
      id: feature.properties.id,
      event: feature.properties.event,
      headline: feature.properties.headline,
      description: feature.properties.description,
      instruction: feature.properties.instruction,
      severity: feature.properties.severity || 'Unknown',
      certainty: feature.properties.certainty || 'Unknown',
      urgency: feature.properties.urgency || 'Unknown',
      areaDesc: feature.properties.areaDesc,
      onset: new Date(feature.properties.onset),
      expires: new Date(feature.properties.expires),
      senderName: feature.properties.senderName,
      status: feature.properties.status,
      messageType: feature.properties.messageType,
      category: feature.properties.category,
      geometry: feature.geometry,
    }));

    return {
      alerts,
      lastFetched: new Date(),
      location: `${latitude}, ${longitude}`,
    };
  } catch (error) {
    console.error('Error fetching NWS alerts:', error);
    throw error;
  }
}

/**
 * Fetches active weather alerts for a specific state
 */
export async function fetchAlertsByState(stateCode: string): Promise<AlertsResponse> {
  try {
    const url = `https://api.weather.gov/alerts/active?area=${stateCode.toUpperCase()}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'MeshBridgeGUI/1.0 (Emergency Alert System)',
        'Accept': 'application/geo+json',
      },
    });

    if (!response.ok) {
      throw new Error(`NWS API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    const alerts: WeatherAlert[] = data.features.map((feature: any) => ({
      id: feature.properties.id,
      event: feature.properties.event,
      headline: feature.properties.headline,
      description: feature.properties.description,
      instruction: feature.properties.instruction,
      severity: feature.properties.severity || 'Unknown',
      certainty: feature.properties.certainty || 'Unknown',
      urgency: feature.properties.urgency || 'Unknown',
      areaDesc: feature.properties.areaDesc,
      onset: new Date(feature.properties.onset),
      expires: new Date(feature.properties.expires),
      senderName: feature.properties.senderName,
      status: feature.properties.status,
      messageType: feature.properties.messageType,
      category: feature.properties.category,
      geometry: feature.geometry,
    }));

    return {
      alerts,
      lastFetched: new Date(),
      location: stateCode.toUpperCase(),
    };
  } catch (error) {
    console.error('Error fetching NWS alerts:', error);
    throw error;
  }
}

/**
 * Determines if an alert should trigger immediate broadcast
 */
export function shouldAutoBroadcast(alert: WeatherAlert): boolean {
  const extremeEvents = [
    'Tornado Warning',
    'Severe Thunderstorm Warning',
    'Flash Flood Warning',
    'Tsunami Warning',
    'Hurricane Warning',
    'Extreme Wind Warning',
    'Storm Surge Warning',
  ];

  return (
    alert.severity === 'Extreme' ||
    (alert.severity === 'Severe' && alert.urgency === 'Immediate') ||
    extremeEvents.some(event => alert.event.includes(event))
  );
}

/**
 * Formats an alert into a concise mesh network message
 */
export function formatAlertForBroadcast(alert: WeatherAlert): string {
  let message = `🌩️ NWS ALERT: ${alert.event}\n`;
  message += `📍 ${alert.areaDesc}\n`;
  message += `⚠️ ${alert.severity} - ${alert.urgency}\n`;

  if (alert.headline) {
    // Truncate headline if too long
    const headline = alert.headline.length > 100
      ? alert.headline.substring(0, 97) + '...'
      : alert.headline;
    message += `${headline}\n`;
  }

  if (alert.instruction) {
    // Extract key instructions (first sentence or up to 150 chars)
    const instruction = alert.instruction.split('.')[0].substring(0, 150);
    message += `📋 ${instruction}${alert.instruction.length > 150 ? '...' : '.'}\n`;
  }

  message += `⏰ Expires: ${alert.expires.toLocaleTimeString()}`;

  return message;
}

/**
 * Gets emoji for alert severity
 */
export function getAlertEmoji(alert: WeatherAlert): string {
  switch (alert.severity) {
    case 'Extreme':
      return '🔴';
    case 'Severe':
      return '🟠';
    case 'Moderate':
      return '🟡';
    case 'Minor':
      return '🔵';
    default:
      return '⚪';
  }
}

/**
 * Gets color class for alert severity
 */
export function getAlertColor(severity: WeatherAlert['severity']): string {
  switch (severity) {
    case 'Extreme':
      return 'red';
    case 'Severe':
      return 'orange';
    case 'Moderate':
      return 'yellow';
    case 'Minor':
      return 'blue';
    default:
      return 'slate';
  }
}

/**
 * List of US state codes for the dropdown
 */
export const US_STATES = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
];
