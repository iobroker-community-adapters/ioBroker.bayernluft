# ioBroker Adapter Development with GitHub Copilot

**Version:** 0.4.0
**Template Source:** https://github.com/DrozmotiX/ioBroker-Copilot-Instructions

This file contains instructions and best practices for GitHub Copilot when working on ioBroker adapter development.

## Project Context

You are working on an ioBroker adapter. ioBroker is an integration platform for the Internet of Things, focused on building smart home and industrial IoT solutions. Adapters are plugins that connect ioBroker to external systems, devices, or services.

## Adapter-Specific Context

- **Adapter Name**: iobroker.bayernluft
- **Primary Function**: Connects ventilation device manufactured by BayernLuft to IoBroker systems
- **Target Devices**: BayernLuft ventilation devices with WLAN32 module
- **Key Features**: 
  - Individual fan speed control (inlet, outlet, anti-freeze)
  - Timer and automatic mode activation  
  - Temperature and humidity monitoring
  - Real-time device status monitoring
  - Custom export configuration file support
- **API Communication**: HTTP requests to device web interface using specific command parameters
- **Configuration Requirements**: Device IP address, port (default 80), custom export template file
- **Device Firmware Versions**: Support for various WS32 firmware versions with different feature sets
- **Special Setup**: Requires uploading `export_iobroker.txt` to device before use

### Device Communication Patterns

- **Status Polling**: Regular HTTP GET requests to `http://device-ip/index.html?export=1` 
- **Command Execution**: HTTP GET requests with specific parameters like `?speedOut=xx`, `?speedIn=xx`, `?timer=1`
- **State Management**: Device states are read-only, commands create separate writable command objects
- **Error Handling**: Robust handling of network timeouts, device offline scenarios, and API changes

### Data Structure

- **States Folder**: Read-only device status values from export data
- **Commands Folder**: Writable command states for device control
- **Info Objects**: Connection status, device information, last update timestamps
- **Multi-language Support**: All state descriptions available in multiple languages

## Testing

### Unit Testing
- Use Jest as the primary testing framework for ioBroker adapters
- Create tests for all adapter main functions and helper methods
- Test error handling scenarios and edge cases
- Mock external API calls and hardware dependencies
- For adapters connecting to APIs/devices not reachable by internet, provide example data files to allow testing of functionality without live connections
- Example test structure:
  ```javascript
  describe('AdapterName', () => {
    let adapter;
    
    beforeEach(() => {
      // Setup test adapter instance
    });
    
    test('should initialize correctly', () => {
      // Test adapter initialization
    });
  });
  ```

### Integration Testing

**IMPORTANT**: Use the official `@iobroker/testing` framework for all integration tests. This is the ONLY correct way to test ioBroker adapters.

**Official Documentation**: https://github.com/ioBroker/testing

#### Framework Structure
Integration tests MUST follow this exact pattern:

```javascript
const path = require('path');
const { tests } = require('@iobroker/testing');

// Define test coordinates or configuration
const TEST_COORDINATES = '52.520008,13.404954'; // Berlin
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Use tests.integration() with defineAdditionalTests
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Test adapter with specific configuration', (getHarness) => {
            let harness;

            before(() => {
                harness = getHarness();
            });

            it('should configure and start adapter', function () {
                return new Promise(async (resolve, reject) => {
                    try {
                        harness = getHarness();
                        
                        // Get adapter object using promisified pattern
                        const obj = await new Promise((res, rej) => {
                            harness.objects.getObject('system.adapter.your-adapter.0', (err, o) => {
                                if (err) return rej(err);
                                res(o);
                            });
                        });
                        
                        if (!obj) {
                            return reject(new Error('Adapter object not found'));
                        }

                        // Configure adapter properties
                        Object.assign(obj.native, {
                            position: TEST_COORDINATES,
                            createCurrently: true,
                            createHourly: true,
                            createDaily: true,
                            // Add other configuration as needed
                        });

                        // Set the updated configuration
                        harness.objects.setObject(obj._id, obj);

                        console.log('✅ Step 1: Configuration written, starting adapter...');
                        
                        // Start adapter and wait
                        await harness.startAdapterAndWait();
                        
                        console.log('✅ Step 2: Adapter started');

                        // Wait for adapter to process data
                        const waitMs = 15000;
                        await wait(waitMs);

                        console.log('🔍 Step 3: Checking states after adapter run...');
                        
                        const states = await harness.states.getKeysAsync(`${harness.adapterName}.0.*`);
                        console.log(`📊 Found ${states.length} states`);
                        
                        if (states.length === 0) {
                            return reject(new Error('Expected at least some states to be created after adapter run'));
                        }

                        console.log('✅ Step 4: Integration test completed successfully');
                        resolve();
                        
                    } catch (error) {
                        console.error('❌ Integration test failed:', error);
                        reject(error);
                    }
                });
            });
        });
    }
});
```

#### Key Testing Requirements:
- **Timeouts**: Use appropriate timeouts (120+ seconds for external dependencies)
- **State Validation**: Check that expected states are created and have correct values
- **Error Scenarios**: Test network failures, device offline, invalid responses
- **Configuration**: Test different adapter configuration combinations
- **Cleanup**: Ensure proper cleanup in test teardown

## Development Patterns for ioBroker Adapters

### Core Adapter Structure
```javascript
class AdapterName extends utils.Adapter {
    constructor(options = {}) {
        super({
            ...options,
            name: 'adaptername',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        // Initialize adapter
        this.setState('info.connection', false, true);
        
        // Start main functionality
        await this.main();
    }

    async onStateChange(id, state) {
        if (!state || state.ack) return;
        
        // Handle state changes
        const idParts = id.split('.');
        const command = idParts[idParts.length - 1];
        
        try {
            await this.handleCommand(command, state.val);
        } catch (error) {
            this.log.error(`Error handling command ${command}: ${error.message}`);
        }
    }

    async onUnload(callback) {
        try {
            // Clear intervals and timers
            if (this.connectionTimer) {
                clearTimeout(this.connectionTimer);
                this.connectionTimer = undefined;
            }
            // Close connections, clean up resources
            callback();
        } catch (e) {
            callback();
        }
    }
}
```

### State Management Best Practices

#### Creating States
```javascript
await this.setObjectNotExistsAsync('states.temperature', {
    type: 'state',
    common: {
        name: {
            en: 'Temperature',
            de: 'Temperatur',
            // ... other languages
        },
        type: 'number',
        role: 'value.temperature',
        read: true,
        write: false,
        unit: '°C',
    },
    native: {},
});
```

#### Creating Commands
```javascript
await this.setObjectNotExistsAsync('commands.setFanSpeed', {
    type: 'state',
    common: {
        name: {
            en: 'Set fan speed (0-10)',
            de: 'Lüftergeschwindigkeit setzen (0-10)',
            // ... other languages
        },
        type: 'number',
        role: 'level',
        read: false,
        write: true,
        min: 0,
        max: 10,
        def: 0,
    },
    native: {},
});
```

### Error Handling & Logging

#### Connection Management
```javascript
async checkConnection() {
    try {
        const response = await this.requestDevice('/index.html');
        if (response) {
            this.setState('info.connection', true, true);
            return true;
        }
    } catch (error) {
        this.log.warn(`Connection check failed: ${error.message}`);
        this.setState('info.connection', false, true);
        return false;
    }
}
```

#### Request Error Handling
```javascript
async requestDevice(endpoint) {
    try {
        const url = `http://${this.config.deviceIP}:${this.config.port}${endpoint}`;
        const response = await fetch(url, {
            timeout: 5000,
            headers: {
                'User-Agent': 'ioBroker-BayernLuft'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.text();
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            throw new Error('Device not reachable - check IP address and network connection');
        } else if (error.code === 'ETIMEDOUT') {
            throw new Error('Request timeout - device may be busy or unreachable');
        } else {
            throw error;
        }
    }
}
```

### JSON-Config Integration

#### Config Schema Structure
```json
{
    "type": "panel",
    "items": {
        "deviceIP": {
            "type": "ip",
            "label": "Device IP Address",
            "tooltip": "IP address of the BayernLuft device",
            "sm": 6
        },
        "port": {
            "type": "number",
            "label": "Device Port",
            "tooltip": "Port of the device (usually 80)",
            "def": 80,
            "min": 1,
            "max": 65535,
            "sm": 6
        },
        "updateInterval": {
            "type": "number",
            "label": "Update Interval (seconds)",
            "tooltip": "How often to poll the device for updates",
            "def": 30,
            "min": 10,
            "max": 3600,
            "sm": 6
        }
    }
}
```

#### Config Access in Adapter
```javascript
onReady() {
    // Access config values
    const deviceIP = this.config.deviceIP;
    const port = this.config.port || 80;
    const interval = this.config.updateInterval || 30;
    
    // Validate config
    if (!deviceIP) {
        this.log.error('Device IP address not configured');
        return;
    }
    
    // Start polling with configured interval
    this.startPolling(interval);
}
```

### BayernLuft Device-Specific Patterns

#### Export Data Parsing
```javascript
parseExportData(data) {
    const lines = data.split('\n');
    const result = {};
    
    for (const line of lines) {
        const [name, value] = line.split('=');
        if (name && value !== undefined) {
            // Convert numeric values
            const numValue = parseFloat(value.replace(',', '.'));
            result[name.trim()] = isNaN(numValue) ? value.trim() : numValue;
        }
    }
    
    return result;
}
```

#### Command Execution
```javascript
async executeCommand(command, value) {
    try {
        let endpoint = '';
        
        switch (command) {
            case 'setFanSpeed':
                endpoint = `?speed=${value}`;
                break;
            case 'setSpeedIn':
                endpoint = `?speedIn=${value}`;
                break;
            case 'setSpeedOut':
                endpoint = `?speedOut=${value}`;
                break;
            case 'timer':
                endpoint = value ? '?timer=1' : '?timer=0';
                break;
            case 'autoMode':
                endpoint = value ? '?auto=1' : '?auto=0';
                break;
            default:
                throw new Error(`Unknown command: ${command}`);
        }
        
        const response = await this.requestDevice(endpoint);
        this.log.info(`Command ${command} executed successfully`);
        
        // Acknowledge the command
        this.setState(`commands.${command}`, value, true);
        
        // Trigger immediate update to reflect changes
        setTimeout(() => this.updateDeviceStates(), 1000);
        
    } catch (error) {
        this.log.error(`Failed to execute command ${command}: ${error.message}`);
        throw error;
    }
}
```

### Multi-language Support

#### Translation Patterns
```javascript
const stateTranslations = {
    temperature: {
        en: 'Temperature',
        de: 'Temperatur',
        ru: 'Температура',
        pt: 'Temperatura',
        nl: 'Temperatuur',
        fr: 'Température',
        it: 'Temperatura',
        es: 'Temperatura',
        pl: 'Temperatura',
        uk: 'Температура',
        'zh-cn': '温度'
    }
};
```

## Code Style and Standards

- Follow JavaScript/TypeScript best practices
- Use async/await for asynchronous operations
- Implement proper resource cleanup in `unload()` method
- Use semantic versioning for adapter releases
- Include proper JSDoc comments for public methods

## CI/CD and Testing Integration

### GitHub Actions for API Testing
For adapters with external API dependencies, implement separate CI/CD jobs:

```yaml
# Tests API connectivity with demo credentials (runs separately)
demo-api-tests:
  if: contains(github.event.head_commit.message, '[skip ci]') == false
  
  runs-on: ubuntu-22.04
  
  steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Use Node.js 20.x
      uses: actions/setup-node@v4
      with:
        node-version: 20.x
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Run demo API tests
      run: npm run test:integration-demo
```

### CI/CD Best Practices
- Run credential tests separately from main test suite
- Use ubuntu-22.04 for consistency
- Don't make credential tests required for deployment
- Provide clear failure messages for API connectivity issues
- Use appropriate timeouts for external API calls (120+ seconds)

### Package.json Script Integration
Add dedicated script for credential testing:
```json
{
  "scripts": {
    "test:integration-demo": "mocha test/integration-demo --exit"
  }
}
```

### Practical Example: Complete API Testing Implementation
Here's a complete example based on lessons learned from the Discovergy adapter:

#### test/integration-demo.js
```javascript
const path = require("path");
const { tests } = require("@iobroker/testing");

// Helper function to encrypt password using ioBroker's encryption method
async function encryptPassword(harness, password) {
    const systemConfig = await harness.objects.getObjectAsync("system.config");
    
    if (!systemConfig || !systemConfig.native || !systemConfig.native.secret) {
        throw new Error("Could not retrieve system secret for password encryption");
    }
    
    const secret = systemConfig.native.secret;
    let result = '';
    for (let i = 0; i < password.length; ++i) {
        result += String.fromCharCode(secret[i % secret.length].charCodeAt(0) ^ password.charCodeAt(i));
    }
    
    return result;
}

// Run integration tests with demo credentials
tests.integration(path.join(__dirname, ".."), {
    defineAdditionalTests({ suite }) {
        suite("API Testing with Demo Credentials", (getHarness) => {
            let harness;
            
            before(() => {
                harness = getHarness();
            });

            it("Should connect to API and initialize with demo credentials", async () => {
                console.log("Setting up demo credentials...");
                
                if (harness.isAdapterRunning()) {
                    await harness.stopAdapter();
                }
                
                const encryptedPassword = await encryptPassword(harness, "demo_password");
                
                await harness.changeAdapterConfig("your-adapter", {
                    native: {
                        username: "demo@provider.com",
                        password: encryptedPassword,
                        // other config options
                    }
                });

                console.log("Starting adapter with demo credentials...");
                await harness.startAdapter();
                
                // Wait for API calls and initialization
                await new Promise(resolve => setTimeout(resolve, 60000));
                
                const connectionState = await harness.states.getStateAsync("your-adapter.0.info.connection");
                
                if (connectionState && connectionState.val === true) {
                    console.log("✅ SUCCESS: API connection established");
                    return true;
                } else {
                    throw new Error("API Test Failed: Expected API connection to be established with demo credentials. " +
                        "Check logs above for specific API errors (DNS resolution, 401 Unauthorized, network issues, etc.)");
                }
            }).timeout(120000);
        });
    }
});
```

## BayernLuft Device Communication Specifics

### Device Firmware Compatibility
- Support multiple firmware versions (WS32231301, WS32240427, WS32243401, etc.)
- Handle API changes between firmware versions gracefully
- Test with different decimal separator settings (comma vs dot)
- Account for new features added in firmware updates

### Export Template Management
- Ensure `export_iobroker.txt` template is up to date with firmware capabilities
- Handle missing values gracefully (set to null with quality flag 0x82)
- Support multiple export templates for different use cases

### Command Execution Patterns
- Individual fan control only available when device is turned off
- Timer and automatic modes have specific activation requirements
- Some commands require specific parameter ranges (0-10 for fans, 0-50 for anti-freeze)

### Network Error Handling
- Handle device offline scenarios gracefully
- Implement exponential backoff for failed requests
- Distinguish between network errors and device errors
- Provide meaningful error messages for troubleshooting