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
  // Validate coordinates
  if (latitude < -90 || latitude > 90) {
    throw new Error(`Invalid latitude: ${latitude}. Must be between -90 and 90.`);
  }
  if (longitude < -180 || longitude > 180) {
    throw new Error(`Invalid longitude: ${longitude}. Must be between -180 and 180.`);
  }

  try {
    const url = `https://api.weather.gov/alerts/active?point=${latitude},${longitude}`;

    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'MeshBridgeGUI/1.0 (Emergency Alert System)',
        'Accept': 'application/geo+json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`NWS API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Validate response structure
    if (!data || !Array.isArray(data.features)) {
      throw new Error('Invalid response format from NWS API');
    }

    const alerts: WeatherAlert[] = data.features
      .filter((feature: any) => feature && feature.properties) // Filter out invalid entries
      .map((feature: any) => ({
        id: feature.properties.id || `unknown-${Date.now()}`,
        event: feature.properties.event || 'Unknown Event',
        headline: feature.properties.headline || '',
        description: feature.properties.description || '',
        instruction: feature.properties.instruction,
        severity: feature.properties.severity || 'Unknown',
        certainty: feature.properties.certainty || 'Unknown',
        urgency: feature.properties.urgency || 'Unknown',
        areaDesc: feature.properties.areaDesc || 'Unknown area',
        onset: feature.properties.onset ? new Date(feature.properties.onset) : new Date(),
        expires: feature.properties.expires ? new Date(feature.properties.expires) : new Date(Date.now() + 86400000),
        senderName: feature.properties.senderName || 'National Weather Service',
        status: feature.properties.status || 'Actual',
        messageType: feature.properties.messageType || 'Alert',
        category: feature.properties.category || 'Met',
        geometry: feature.geometry,
      }));

    return {
      alerts,
      lastFetched: new Date(),
      location: `${latitude}, ${longitude}`,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('NWS API request timeout');
      throw new Error('Request timeout: NWS API took too long to respond');
    }
    console.error('Error fetching NWS alerts:', error);
    throw error;
  }
}

/**
 * Fetches active weather alerts for a specific state
 */
export async function fetchAlertsByState(stateCode: string): Promise<AlertsResponse> {
  // Validate state code
  if (!stateCode || stateCode.length !== 2) {
    throw new Error(`Invalid state code: ${stateCode}. Must be a 2-letter state code (e.g., CA, WA).`);
  }

  const upperStateCode = stateCode.toUpperCase();

  try {
    const url = `https://api.weather.gov/alerts/active?area=${upperStateCode}`;

    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'MeshBridgeGUI/1.0 (Emergency Alert System)',
        'Accept': 'application/geo+json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Invalid state code: ${upperStateCode}`);
      }
      throw new Error(`NWS API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Validate response structure
    if (!data || !Array.isArray(data.features)) {
      throw new Error('Invalid response format from NWS API');
    }

    const alerts: WeatherAlert[] = data.features
      .filter((feature: any) => feature && feature.properties) // Filter out invalid entries
      .map((feature: any) => ({
        id: feature.properties.id || `unknown-${Date.now()}`,
        event: feature.properties.event || 'Unknown Event',
        headline: feature.properties.headline || '',
        description: feature.properties.description || '',
        instruction: feature.properties.instruction,
        severity: feature.properties.severity || 'Unknown',
        certainty: feature.properties.certainty || 'Unknown',
        urgency: feature.properties.urgency || 'Unknown',
        areaDesc: feature.properties.areaDesc || 'Unknown area',
        onset: feature.properties.onset ? new Date(feature.properties.onset) : new Date(),
        expires: feature.properties.expires ? new Date(feature.properties.expires) : new Date(Date.now() + 86400000),
        senderName: feature.properties.senderName || 'National Weather Service',
        status: feature.properties.status || 'Actual',
        messageType: feature.properties.messageType || 'Alert',
        category: feature.properties.category || 'Met',
        geometry: feature.geometry,
      }));

    return {
      alerts,
      lastFetched: new Date(),
      location: upperStateCode,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('NWS API request timeout');
      throw new Error('Request timeout: NWS API took too long to respond');
    }
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
