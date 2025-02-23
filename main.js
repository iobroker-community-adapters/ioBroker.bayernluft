'use strict';

/*
 * Created with @iobroker/create-adapter v2.3.0
 */

const utils = require('@iobroker/adapter-core');
// @ts-expect-error typechecking fails for spread operator
const NodeFetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

class Bayernluft extends utils.Adapter {
    devices = {};

    constructor(options) {
        super({
            ...options,
            name: 'bayernluft',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Initialices the internal device objects.
     */
    async initDevices() {
        this.log.debug(`initDevices()`);

        for (const device of this.config.devices) {
            if (!device.enabled) {
                this.log.debug(`Skipping device ${device.name} as not enabled`);
                continue;
            }
            if (device.name === '') {
                this.log.warn(`Skipping device with empty name field`);
                continue;
            }
            if (device.ip === '') {
                this.log.error(`No ip specified for device ${device.name} - will be skipped`);
            }
            if (device.port < 0 || device.port > 65535) {
                this.log.error(`Port ${device.port} is invalid for device ${device.name} - will be skipped`);
            }

            const dev = {};
            dev.id = (device.name || '').replace(/[^A-Za-z0-9-_]/, '_');
            dev.enabled = device.enabled;
            dev.name = device.name;
            dev.ip = device.ip;
            dev.port = device.port;
            dev.online = device.online;

            this.devices[dev.id] = dev;
        }
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Reset the connection indicator during startup
        this.setState('info.connection', false, true);

        // initialize devices object
        await this.initDevices();

        // If no devices are configured, disable the adapter
        if (!Object.keys(this.devices).length) {
            this.log.error('No devices have been set, disabling adapter!');
            this.terminate(utils.EXIT_CODES.ADAPTER_REQUESTED_TERMINATION);
            // no reach area
        }

        // Create objects for enabled devices
        await this.createDeviceObjects();

        // Check device connections and set info.connection if one is reachable
        await this.checkDeviceConnections();

        //initial device query
        await this.queryDevices();

        // limit pollIntervall and start polling
        let pollInterval = this.config.pollInterval;
        if (pollInterval < 5) {
            this.log.info('pollintervall set to 5s');
            pollInterval = 5;
        }
        if (pollInterval > 3600) {
            this.log.info('pollinterval set to 3600s');
            pollInterval = 3600;
        }

        this.pollInterval = this.setInterval(async () => {
            // Check device connections and set info.connection if one is reachable
            await this.checkDeviceConnections();
            //device query
            await this.queryDevices();
        }, pollInterval * 1000);
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param callback Callback function
     */
    async onUnload(callback) {
        try {
            await this.setState('info.connection', false, true);
            this.pollInterval && this.clearInterval(this.pollInterval);
            callback();
        } catch {
            callback();
        }
    }

    /**
     * Checks the connections of the devices and sets the connection state accordingly.
     */
    async checkDeviceConnections() {
        this.log.debug(`checkDeviceConnections()`);

        let isAtLeastOneDeviceReachable = false;
        for (const id in this.devices) {
            const device = this.devices[id];
            this.log.debug(`checking device ${id} - ${device.name} - ${device.ip}:${device.port}`);
            try {
                const response = await NodeFetch(`http://${device.ip}:${device.port}/`);
                if (response.ok) {
                    this.log.debug(`Device ${device.name} is reachable.`);

                    this.setState(`${device.id}.info.reachable`, true, true);
                    isAtLeastOneDeviceReachable = true;
                    //connection state set to true if at least one device is reachable
                } else {
                    this.log.warn(`Device ${device.name} is not reachable.`);
                    this.setState(`${device.id}.info.reachable`, false, true);
                }
            } catch (error) {
                this.log.warn(`Error checking connection for device ${device.name}: ${error.message}`);
                this.setState(`${device.id}.info.reachable`, false, true);
            }
        }

        this.setState('info.connection', isAtLeastOneDeviceReachable, true);
    }

    /**
     * Query all devices and update states
     */
    async queryDevices() {
        this.log.debug(`queryDevices()`);

        for (const id of this.config.devices) {
            const device = this.devices[id];
            this.log.debug(`checking device ${id} - ${device.name} - ${device.ip}:${device.port}`);
            this.queryDevice(device);
        }
    }

    /**
     * Query a specific device and update states
     *
     * @param device The device to query (full device object)
     */
    async queryDevice(device) {
        this.log.debug(`queryDevice(${device.name})`);

        if (!device.reachable) {
            this.log.warn(`Skip polling for device: ${device.name} (not reachable)`);
            return;
        }

        let deviceInfo = {};
        deviceInfo = await this.getHttpRequest(
            `http://${device.ip}:${device.port}/index.html?export=iobroker&decimal=point`,
            device,
        );

        if (deviceInfo == null) {
            this.log.debug(`Response for: ${device.name} - null`);
            return;
        }

        this.log.debug(`Response for: ${device.name} - ${JSON.stringify(deviceInfo)}`);

        if (deviceInfo.date) {
            this.log.debug(`date: ${deviceInfo.date}`);
            this.setState(`${device.name}.info.date`, deviceInfo.date, true);
        }
        if (deviceInfo.time) {
            this.log.debug(`time: ${deviceInfo.time}`);
            this.setState(`${device.name}.info.time`, deviceInfo.time, true);
        }
        if (deviceInfo.deviceName) {
            this.log.debug(`deviceName: ${deviceInfo.deviceName}`);
            this.setState(`${device.name}.info.deviceName`, deviceInfo.deviceName, true);
        }
        if (deviceInfo.mac) {
            this.log.debug(`mac: ${deviceInfo.mac}`);
            this.setState(`${device.name}.info.mac`, deviceInfo.mac, true);
        }
        if (deviceInfo.localIP) {
            this.log.debug(`ip: ${deviceInfo.localIP}`);
            this.setState(`${device.name}.info.ip`, deviceInfo.localIP, true);
        }
        if (deviceInfo.rssi) {
            this.log.debug(`rssi: ${deviceInfo.rssi}`);
            this.setState(`${device.name}.info.rssi`, parseInt(deviceInfo.rssi), true);
        }
        if (deviceInfo.fwMainController) {
            this.log.debug(`fwMainController: ${deviceInfo.fwMainController}`);
            this.setState(`${device.name}.info.fwMainController`, deviceInfo.fwMainController, true);
        }
        if (deviceInfo.fwWiFi) {
            this.log.debug(`fwWiFi: ${deviceInfo.fwWiFi}`);
            this.setState(`${device.name}.info.fwWiFi`, deviceInfo.fwWiFi, true);
        }
        if (deviceInfo.isSystemOn !== undefined) {
            this.log.debug(`on: ${deviceInfo.isSystemOn == 0 ? false : true}`);
            this.setState(`${device.name}.info.on`, deviceInfo.isSystemOn == 0 ? false : true, true);
        }
        if (deviceInfo.temperatureIn !== undefined) {
            this.log.debug(`temperatureIn: ${deviceInfo.temperatureIn}`);
            this.setState(`${device.name}.temperatureIn`, parseFloat(deviceInfo.temperatureIn), true);
        }
        if (deviceInfo.temperatureOut !== undefined) {
            this.log.debug(`temperatureOut: ${deviceInfo.temperatureOut}`);
            this.setState(`${device.name}.temperatureOut`, parseFloat(deviceInfo.temperatureOut), true);
        }
        if (deviceInfo.temperatureFresh !== undefined) {
            this.log.debug(`temperatureFresh: ${deviceInfo.temperatureFresh}`);
            this.setState(`${device.name}.temperatureFresh`, parseFloat(deviceInfo.temperatureFresh), true);
        }
        if (deviceInfo.relativeHumidityIn !== undefined) {
            this.log.debug(`relativeHumidityIn: ${deviceInfo.relativeHumidityIn}`);
            this.setState(`${device.name}.relativeHumidityIn`, parseFloat(deviceInfo.relativeHumidityIn), true);
        }
        if (deviceInfo.relativeHumidityOut !== undefined) {
            this.log.debug(`relativeHumidityOut: ${deviceInfo.relativeHumidityOut}`);
            this.setState(`${device.name}.relativeHumidityOut`, parseFloat(deviceInfo.relativeHumidityOut), true);
        }
        if (deviceInfo.absoluteHumidityIn !== undefined) {
            this.log.debug(`absoluteHumidityIn: ${deviceInfo.absoluteHumidityIn}`);
            this.setState(`${device.name}.absoluteHumidityIn`, parseFloat(deviceInfo.absoluteHumidityIn), true);
        }
        if (deviceInfo.absoluteHumidityOut !== undefined) {
            this.log.debug(`absoluteHumidityOut: ${deviceInfo.absoluteHumidityOut}`);
            this.setState(`${device.name}.absoluteHumidityOut`, parseFloat(deviceInfo.absoluteHumidityOut), true);
        }
        if (deviceInfo.efficiency !== undefined) {
            this.log.debug(`efficiency: ${deviceInfo.efficiency}`);
            if (deviceInfo.efficiency == 'N/A') {
                //when device is off, query returns  'efficiency':'N/A'
                this.setState(`${device.name}.efficiency`, 0, true);
            } else {
                this.setState(`${device.name}.efficiency`, parseFloat(deviceInfo.efficiency), true);
            }
        }
        if (deviceInfo.humidityTransport !== undefined) {
            this.log.debug(`humidityTransport: ${deviceInfo.humidityTransport}`);
            this.setState(`${device.name}.humidityTransport`, parseInt(deviceInfo.humidityTransport), true);
        }
        if (deviceInfo.fanSpeedIn !== undefined) {
            this.log.debug(`fanSpeedIn: ${deviceInfo.fanSpeedIn}`);
            this.setState(`${device.name}.fanSpeedIn`, parseInt(deviceInfo.fanSpeedIn), true);
        }
        if (deviceInfo.fanSpeedOut !== undefined) {
            this.log.debug(`fanSpeedOut: ${deviceInfo.fanSpeedOut}`);
            this.setState(`${device.name}.fanSpeedOut`, parseInt(deviceInfo.fanSpeedOut), true);
        }
        if (deviceInfo.fanSpeedAntiFreeze !== undefined) {
            this.log.debug(`fanSpeedAntiFreeze: ${deviceInfo.fanSpeedAntiFreeze}`);
            this.setState(`${device.name}.fanSpeedAntiFreeze`, parseInt(deviceInfo.fanSpeedAntiFreeze), true);
        }
        if (deviceInfo.isAntiFreezeActive !== undefined) {
            this.log.debug(`isAntiFreezeActive: ${deviceInfo.isAntiFreezeActive == 0 ? false : true}`);
            this.setState(`${device.name}.isAntiFreezeActive`, deviceInfo.isAntiFreezeActive == 0 ? false : true, true);
        }
        if (deviceInfo.isFixedSpeedActive !== undefined) {
            this.log.debug(`isFixedSpeedActive: ${deviceInfo.isFixedSpeedActive == 0 ? false : true}`);
            this.setState(`${device.name}.isFixedSpeedActive`, deviceInfo.isFixedSpeedActive == 0 ? false : true, true);
        }
        if (deviceInfo.isDefrostModeActive !== undefined) {
            this.log.debug(`isDefrostModeActive: ${deviceInfo.isDefrostModeActive == 0 ? false : true}`);
            this.setState(
                `${device.name}.isDefrostModeActive`,
                deviceInfo.isDefrostModeActive == 0 ? false : true,
                true,
            );
        }
        if (deviceInfo.isLandlordModeActive !== undefined) {
            this.log.debug(`isLandlordModeActive: ${deviceInfo.isLandlordModeActive == 0 ? false : true}`);
            this.setState(
                `${device.name}.isLandlordModeActive`,
                deviceInfo.isLandlordModeActive == 0 ? false : true,
                true,
            );
        }
        if (deviceInfo.isCrossVentilationActive !== undefined) {
            this.log.debug(`isCrossVentilationActive: ${deviceInfo.isCrossVentilationActive == 0 ? false : true}`);
            this.setState(
                `${device.name}.isCrossVentilationActive`,
                deviceInfo.isCrossVentilationActive == 0 ? false : true,
                true,
            );
        }
        if (deviceInfo.isTimerActive !== undefined) {
            this.log.debug(`isTimerActive: ${deviceInfo.isTimerActive == 0 ? false : true}`);
            this.setState(`${device.name}.isTimerActive`, deviceInfo.isTimerActive == 0 ? false : true, true);
        }
    }

    /**
     * Is called if a subscribed state changes
     *
     * @param id State ID that changed
     * @param state State object with the new state
     */
    async onStateChange(id, state) {
        this.log.debug(`onStateChange(id: ${id} Value ${state.val} ACK ${state.ack})`);

        if (id && state && !state.ack) {
            const id_splits = id.split('.');
            //const realid = `${id_splits[2]}.${id_splits[3]}.${id_splits[4]}`;
            //const device = await this.getDeviceByName(id_splits[2]);
            const devId = id_splits[2];
            if (!(devId && this.devices[devId])) {
                return;
            }

            const device = this.devices[devId];

            this.log.debug(
                `onStateChange: id: ${id} Device ${device.name} IP ${device.ip} Port ${device.port} Value ${state.val}`,
            );

            if (id.includes('.setFanSpeedIn')) {
                const isSystemOnState = await this.getStateAsync(`${device.name}.info.on`);
                if (isSystemOnState && !isSystemOnState.val) {
                    const res = await this.sendHttpRequest(
                        `http://${device.ip}:${device.port}/?speedIn=${state.val}`,
                        device,
                    );
                    if (!res) {
                        return this.log.error(
                            `An error has occured while trying to set Device ${device.name} fan speed In to ${state.val}`,
                        );
                    }
                    await this.setState(id, state.val, true);
                } else {
                    return this.log.warn(
                        `Setting fan speed in to ${state.val} for Device ${device.name} was not set because the device is on! Individual fan speeds can only be set while the device is turned off.`,
                    );
                }
            } else if (id.includes('.setFanSpeedOut')) {
                const isSystemOnState = await this.getStateAsync(`${device.name}.info.on`);
                if (isSystemOnState && !isSystemOnState.val) {
                    const res = await this.sendHttpRequest(
                        `http://${device.ip}:${device.port}/?speedOut=${state.val}`,
                        device.name,
                    );
                    if (!res) {
                        return this.log.error(
                            `An error has occured while trying to set Device ${device.name} fan speed Out to ${state.val}`,
                        );
                    }
                    await this.setState(id, state.val, true);
                } else {
                    return this.log.warn(
                        `Setting fan speed out to ${state.val} for Device ${device.name} was not set because the device is on! Individual fan speeds can only be set while the device is turned off.`,
                    );
                }
            } else if (id.includes('.setFanSpeedAntiFreeze')) {
                const isSystemOnState = await this.getStateAsync(`${device.name}.info.on`);
                if (isSystemOnState && !isSystemOnState.val) {
                    const res = await this.sendHttpRequest(
                        `http://${device.ip}:${device.port}/?speedFrM=${state.val}`,
                        device.name,
                    );
                    if (!res) {
                        return this.log.error(
                            `An error has occured while trying to set Device ${device.name} fan speed AntiFreeze to ${state.val}`,
                        );
                    }
                    await this.setState(id, state.val, true);
                } else {
                    return this.log.warn(
                        `Setting fan speed AntiFreeze to ${state.val} for Device ${device.name} was not set because the device is on! Individual fan speeds can only be set while the device is turned off.`,
                    );
                }
            } else if (id.includes('.setFanSpeed')) {
                const res = await this.sendHttpRequest(
                    `http://${device.ip}:${device.port}/?speed=${state.val}`,
                    device.name,
                );
                if (!res) {
                    return this.log.error(
                        `An error has occured while trying to set Device ${device.name} fan speed to ${state.val}`,
                    );
                }
                this.log.debug(`DEBUG: Setting ACK id ${id} to true`);
                this.setState(id, state.val, true);
            } else if (id.includes('.powerOn')) {
                const res = await this.sendHttpRequest(`http://${device.ip}:${device.port}/?power=on`);
                if (!res) {
                    return this.log.error(`An error has occured while trying to power on device ${device.name}`);
                }
                await this.setState(id, false, true);
            } else if (id.includes('.powerOff')) {
                const res = await this.sendHttpRequest(`http://${device.ip}:${device.port}/?power=off`);
                if (!res) {
                    return this.log.error(`An error has occured while trying to power off device ${device.name}`);
                }
                await this.setState(id, false, true);
            } else if (id.includes('.autoMode')) {
                const res = await this.sendHttpRequest(`http://${device.ip}:${device.port}/?speed=0`);
                if (!res) {
                    return this.log.error(
                        `An error has occured while trying to set automatic mode for device ${device.name}`,
                    );
                }
                await this.setState(id, false, true);
            } else if (id.includes('.togglePower')) {
                const res = await this.sendHttpRequest(`http://${device.ip}:${device.port}/?button=power`);
                if (!res) {
                    return this.log.error(
                        `An error has occured while trying to send power button for device ${device.name}`,
                    );
                }
                await this.setState(id, false, true);
            } else if (id.includes('.timer')) {
                const res = await this.sendHttpRequest(`http://${device.ip}:${device.port}/?button=timer`);
                if (!res) {
                    return this.log.error(
                        `An error has occured while trying to send power button to device ${device.name}`,
                    );
                }
                await this.setState(id, false, true);
            } else if (id.includes('.syncTime')) {
                const res = await this.sendHttpRequest(`http://${device.ip}:${device.port}/index.html?TimeSync=1`);
                if (!res) {
                    return this.log.error(`An error has occured while trying to sync time for device ${device.name}`);
                }
                await this.setState(id, false, true);
            }
            this.queryDevice(device);
        }
    }

    // /**
    //  * Get Device Info by Name
    //  *
    //  * @param name Device name
    //  */
    // async getDeviceByName(name) {
    //     this.log.debug(`getDeviceByName(${name})`);
    //     const devices = this.config.devices;
    //     if (devices == null || !devices) {
    //         return null;
    //     }
    //     let device = null;
    //     for await (const devicen of devices) {
    //         if (devicen.name == name) {
    //             device = devicen;
    //             break;
    //         }
    //     }
    //     return device;
    // }

    // /**
    //  * Create initial device objects, e.g. if device is reachable
    //  */
    // async createInitialDeviceObjects() {
    //     for await (const device of this.config.devices) {
    //         //Create Device
    //         this.extendObject(
    //             device.name,
    //             {
    //                 type: 'device',
    //                 common: {
    //                     name: `${device.name}`,
    //                 },
    //                 native: {},
    //             },
    //             { preserve: { common: ['name'] } },
    //         );

    //         // Create channels
    //         await this.extendObject(
    //             `${device.name}.info`,
    //             {
    //                 type: 'channel',
    //                 common: {
    //                     name: 'Information',
    //                 },
    //                 native: {},
    //             },
    //             { preserve: { common: ['name'] } },
    //         );

    //         // Create reachable indicator
    //         await this.extendObject(
    //             `${device.name}.info.reachable`,
    //             {
    //                 type: 'state',
    //                 common: {
    //                     name: {
    //                         de: 'Gerät ist erreichbar',
    //                         en: 'Device is reachable',
    //                     },
    //                     type: 'boolean',
    //                     role: 'indicator.reachable',
    //                     read: true,
    //                     write: false,
    //                 },
    //                 native: {},
    //             },
    //             { preserve: { common: ['name'] } },
    //         );
    //     }
    // }

    /**
     * Create device specific objects
     */
    async createDeviceObjects() {
        this.log.debug(`createDeviceObjects()`);

        for (const id in this.devices) {
            const device = this.devices[id];
            this.log.debug(`creating objectsfor device ${id} - ${device.name} - ${device.ip}:${device.port}`);

            //Create device objects
            this.extendObject(
                device.id,
                {
                    type: 'device',
                    common: {
                        name: `${device.name}`,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            // Create channels
            await this.extendObject(
                `${device.id}.info`,
                {
                    type: 'channel',
                    common: {
                        name: 'Information',
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            // Create reachable indicator
            await this.extendObject(
                `${device.id}.info.reachable`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Gerät ist erreichbar',
                            en: 'Device is reachable',
                        },
                        type: 'boolean',
                        role: 'indicator.reachable',
                        read: true,
                        write: false,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            // Create channels
            await this.extendObject(
                `${device.id}.commands`,
                {
                    type: 'channel',
                    common: {
                        name: 'Commands',
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            // Create Objects
            await this.extendObject(
                `${device.id}.info.date`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Datum des Geräts',
                            en: 'Date of the device',
                        },
                        type: 'string',
                        role: 'date',
                        read: true,
                        write: false,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            await this.extendObject(
                `${device.id}.info.time`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Zeit des Geräts',
                            en: 'Time of the device',
                        },
                        type: 'string',
                        role: 'time',
                        read: true,
                        write: false,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            await this.extendObject(
                `${device.id}.info.deviceName`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Name des Geräts',
                            en: 'Name of the device',
                        },
                        type: 'string',
                        role: 'info.name',
                        read: true,
                        write: false,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            await this.extendObject(
                `${device.id}.info.mac`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'MAC-Addresse des Geräts',
                            en: 'MAC address of the device',
                        },
                        type: 'string',
                        role: 'info.mac',
                        read: true,
                        write: false,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            await this.extendObject(
                `${device.id}.info.ip`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'IP-Addresse des Geräts',
                            en: 'IP address of the device',
                        },
                        type: 'string',
                        role: 'info.ip',
                        read: true,
                        write: false,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            await this.extendObject(
                `${device.id}.info.rssi`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Received Signal Strength Indication in dBm',
                            en: 'Received Signal Strength Indication in dBm',
                        },
                        type: 'number',
                        role: 'value',
                        read: true,
                        write: false,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            await this.extendObject(
                `${device.id}.info.fwMainController`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Firmware Version des Hauptcontrollers',
                            en: 'Firmware Version of the main controller',
                        },
                        type: 'string',
                        role: 'info.firmware',
                        read: true,
                        write: false,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            await this.extendObject(
                `${device.id}.info.fwWiFi`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Firmware Version des WLAN Moduls',
                            en: 'Firmware Version of the wifi controller',
                        },
                        type: 'string',
                        role: 'info.firmware',
                        read: true,
                        write: false,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            await this.extendObject(
                `${device.id}.info.on`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Gerät eingeschaltet',
                            en: 'Device turned on',
                        },
                        type: 'boolean',
                        role: 'indicator',
                        read: true,
                        write: false,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            await this.extendObject(
                `${device.id}.temperatureIn`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Temperatur der Zuluft',
                            en: 'Temperature of the supply air',
                        },
                        type: 'number',
                        role: 'value.temperature',
                        read: true,
                        write: false,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            await this.extendObject(
                `${device.id}.temperatureOut`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Temperatur der Abluft',
                            en: 'Temperature of the exhaust air',
                        },
                        type: 'number',
                        role: 'value.temperature',
                        read: true,
                        write: false,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            await this.extendObject(
                `${device.id}.temperatureFresh`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Temperatur der Frischluft',
                            en: 'Temperature of the fresh air',
                        },
                        type: 'number',
                        role: 'value.temperature',
                        read: true,
                        write: false,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            await this.extendObject(
                `${device.id}.relativeHumidityIn`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Relative Luftfeuchtigkeit der Zuluft',
                            en: 'Relative humidity of the supply air',
                        },
                        type: 'number',
                        role: 'value.humidity',
                        read: true,
                        write: false,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            await this.extendObject(
                `${device.id}.relativeHumidityOut`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Relative Luftfeuchtigkeit der Abluft',
                            en: 'Relative humidity of the exhaust air',
                        },
                        type: 'number',
                        role: 'value.humidity',
                        read: true,
                        write: false,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            await this.extendObject(
                `${device.id}.absoluteHumidityIn`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Absolute Luftfeuchtigkeit der Zuluft',
                            en: 'Absolute humidity of the supply air',
                        },
                        type: 'number',
                        role: 'value.humidity',
                        read: true,
                        write: false,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            await this.extendObject(
                `${device.id}.absoluteHumidityOut`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Absolute Luftfeuchtigkeit der Abluft',
                            en: 'Absolute humidity of the exhaust air',
                        },
                        type: 'number',
                        role: 'value.humidity',
                        read: true,
                        write: false,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            await this.extendObject(
                `${device.id}.efficiency`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Effizienz der Wärmerückgewinnung in Prozent',
                            en: 'Efficiency of the heat recovery in percent',
                        },
                        type: 'number',
                        role: 'value',
                        read: true,
                        write: false,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            await this.extendObject(
                `${device.id}.humidityTransport`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Feuchtigkeitstransport in g/24h',
                            en: 'Humidity transport in g/24h',
                        },
                        type: 'number',
                        role: 'value',
                        read: true,
                        write: false,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            await this.extendObject(
                `${device.id}.fanSpeedIn`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Geschwindigkeit des Zuluftventilators',
                            en: 'Speed of the supply air fan',
                        },
                        type: 'number',
                        role: 'level.speed',
                        read: true,
                        write: false,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            await this.extendObject(
                `${device.id}.fanSpeedOut`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Geschwindigkeit des Abluftventilators',
                            en: 'Speed of the exhaust air fan',
                        },
                        type: 'number',
                        role: 'level.speed',
                        read: true,
                        write: false,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            await this.extendObject(
                `${device.id}.fanSpeedAntiFreeze`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Geschwindigkeit des Frostschutzventilators',
                            en: 'Speed of the antifreeze fan',
                        },
                        type: 'number',
                        role: 'level.speed',
                        read: true,
                        write: false,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            await this.extendObject(
                `${device.id}.isAntiFreezeActive`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Frostschutz ist aktiviert',
                            en: 'Antifreeze is active',
                        },
                        type: 'boolean',
                        role: 'indicator',
                        read: true,
                        write: false,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            await this.extendObject(
                `${device.id}.isFixedSpeedActive`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Fixed Speed ist aktiviert',
                            en: 'Fixed speed is active',
                        },
                        type: 'boolean',
                        role: 'indicator',
                        read: true,
                        write: false,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            await this.extendObject(
                `${device.id}.isDefrostModeActive`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Abtaumodus ist aktiviert',
                            en: 'Defrost mode is active',
                        },
                        type: 'boolean',
                        role: 'indicator',
                        read: true,
                        write: false,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            await this.extendObject(
                `${device.id}.isLandlordModeActive`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Vermietermodus ist aktiviert',
                            en: 'Landlord mode is active',
                        },
                        type: 'boolean',
                        role: 'indicator',
                        read: true,
                        write: false,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            await this.extendObject(
                `${device.id}.isCrossVentilationActive`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Querlüftungsmodus ist aktiviert',
                            en: 'Cross ventilation mode is active',
                        },
                        type: 'boolean',
                        role: 'indicator',
                        read: true,
                        write: false,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            await this.extendObject(
                `${device.id}.isTimerActive`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Timer ist aktiviert',
                            en: 'Timer is active',
                        },
                        type: 'boolean',
                        role: 'indicator',
                        read: true,
                        write: false,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            //Create commands
            await this.extendObject(
                `${device.id}.commands.setFanSpeed`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Setze Geschwindigkeit des Zu- und Abluftventilators (0-10)',
                            en: 'Set speed of supply and exhaust air fan (0-10)',
                        },
                        type: 'number',
                        role: 'level.speed',
                        read: true,
                        write: true,
                        min: 0,
                        max: 10,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            await this.extendObject(
                `${device.id}.commands.setFanSpeedIn`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Setze Geschwindigkeit des Zuluftventilators (0-10) - Nur bei ausgeschaltetem Gerät',
                            en: 'Set speed of supply air fan (0-10) - only when device is turned off',
                        },
                        type: 'number',
                        role: 'level.speed',
                        read: true,
                        write: true,
                        min: 0,
                        max: 10,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            await this.extendObject(
                `${device.id}.commands.setFanSpeedOut`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Setze Geschwindigkeit des Abluftventilators (0-10) - Nur bei ausgeschaltetem Gerät',
                            en: 'Set speed of exhaust air fan (0-10) - only when device is turned off',
                        },
                        type: 'number',
                        role: 'level.speed',
                        read: true,
                        write: true,
                        min: 0,
                        max: 10,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            await this.extendObject(
                `${device.id}.commands.setFanSpeedAntiFreeze`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Setze Geschwindigkeit des Frostschutzventilators (0-50) - Nur bei ausgeschaltetem Gerät',
                            en: 'Set speed of antifreeze fan (0-50) - only when device is turned off',
                        },
                        type: 'number',
                        role: 'level.speed',
                        read: true,
                        write: true,
                        min: 0,
                        max: 50,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            await this.extendObject(
                `${device.id}.commands.powerOn`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Gerät einschalten',
                            en: 'Turn on device',
                        },
                        type: 'boolean',
                        role: 'button',
                        read: false,
                        write: true,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            await this.extendObject(
                `${device.id}.commands.powerOff`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Gerät ausschalten',
                            en: 'Turn off device',
                        },
                        type: 'boolean',
                        role: 'button',
                        read: false,
                        write: true,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            await this.extendObject(
                `${device.id}.commands.togglePower`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Gerät ein-/ausschalten',
                            en: 'Turn on/off device',
                        },
                        type: 'boolean',
                        role: 'button',
                        read: false,
                        write: true,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            await this.extendObject(
                `${device.id}.commands.autoMode`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Aktiviere Automatikmodus',
                            en: 'Activate automatic mode',
                        },
                        type: 'boolean',
                        role: 'button',
                        read: false,
                        write: true,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            await this.extendObject(
                `${device.id}.commands.timer`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Aktiviere Timer',
                            en: 'Activate timer',
                        },
                        type: 'boolean',
                        role: 'button',
                        read: false,
                        write: true,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            await this.extendObject(
                `${device.id}.commands.syncTime`,
                {
                    type: 'state',
                    common: {
                        name: {
                            de: 'Synchronisiere Datum und Uhrzeit des Geräts vom Zeitserver',
                            en: 'Synchronize date and time of the device from the time server',
                        },
                        type: 'boolean',
                        role: 'button',
                        read: false,
                        write: true,
                    },
                    native: {},
                },
                { preserve: { common: ['name'] } },
            );

            this.subscribeStates(`${device.id}.commands.*`);
        }
    }

    /**
     *
     * @param url URL to get Data from
     * @param device device object
     */
    async getHttpRequest(url, device) {
        this.log.debug(`getHttpRequest(${url},${device.name})`);

        let response = null;
        try {
            response = await NodeFetch(url);
        } catch (error) {
            this.setState(`${device.id}.info.reachable`, false, true);
            if (error.code == 'ETIMEDOUT') {
                this.log.warn(
                    `An error has occured while trying to get response from device ${device.name}. Connection timed out!`,
                );
                return null;
            }
            if (error.code == 'ECONNREFUSED') {
                this.log.warn(
                    `An error has occured while trying to get response from device ${device.name}. Connection has been refused!`,
                );
                return null;
            }
            this.log.warn(`An unexpected error has occured while trying to get response from device ${device.name}.`);
            return null;
        }

        let data = null;
        try {
            data = response.json();
        } catch (error) {
            if (error.type == 'invalid-json') {
                this.log.error(
                    'An error has occured while trying to format json data. Did you setup the template correctly? Go to LINK to setup template correctly',
                );
                return null;
            }
            this.log.error(`Unexpected Error while trying to format json data! ${error}`);
            return null;
        }

        return data;
    }

    /**
     * Send HTTP Request without returning any data
     *
     * @param url URL to send the Command
     * @param deviceName Device Name
     */
    async sendHttpRequest(url, deviceName) {
        this.log.debug(`sendHttpRequest(${url}, ${deviceName})`);

        let response = null;
        try {
            response = await NodeFetch(url);
        } catch (error) {
            if (error.code == 'ETIMEDOUT') {
                this.log.error(
                    `An error has occured while trying to send request to device ${deviceName}. The Connection timed out!`,
                );
                return null;
            }
            if (error.code == 'ECONNREFUSED') {
                this.log.error(
                    `An error has occured while trying to send request to device ${deviceName}. The Connection has been refused!`,
                );
                return null;
            }
            this.log.error(`An unexpected error has occred while trying to send request to device ${deviceName}.`);
        }

        if (response.status == 200 && response.statusText == 'OK') {
            return true;
        }
        return false;
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = options => new Bayernluft(options);
} else {
    // otherwise start the instance directly
    new Bayernluft();
}
