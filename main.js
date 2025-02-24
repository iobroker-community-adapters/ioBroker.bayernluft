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

        if (!this.config.devices) {
            return;
        }

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
            dev.id = (device.name || '')
                .replace('ß', 'ss')
                .replace('ä', 'ae')
                .replace('Ä', 'Ae')
                .replace('ö', 'oe')
                .replace('Ö', 'Oe')
                .replace('ü', 'ue')
                .replace('Ü', 'Ue')
                .replace(/[^A-Za-z0-9-_]/, '_');
            dev.enabled = device.enabled;
            dev.name = device.name;
            dev.ip = device.ip;
            dev.port = device.port;
            dev.online = device.online;
            dev.reachable = undefined;

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
            this.disable();
            return;
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
                    if (!device.reachable) {
                        this.log.info(`Device ${device.name} is reachable.`);
                    } else {
                        this.log.debug(`Device ${device.name} is reachable.`);
                    }

                    device.reachable = true;
                    this.setState(`${device.id}.info.reachable`, true, true);
                    isAtLeastOneDeviceReachable = true;
                    //connection state set to true if at least one device is reachable
                } else {
                    if (device.reachable === undefined || device.reachable) {
                        this.log.warn(`Device ${device.name} is not reachable.`);
                    } else {
                        this.log.debug(`Device ${device.name} is not reachable.`);
                    }

                    device.reachable = false;
                    this.setState(`${device.id}.info.reachable`, false, true);
                }
            } catch (error) {
                if (device.reachable === undefined || device.reachable) {
                    this.log.warn(`Error checking connection for device ${device.name}: ${error.message}`);
                } else {
                    this.log.debug(`Error checking connection for device ${device.name}: ${error.message}`);
                }

                device.reachable = false;
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

        for (const id in this.devices) {
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
            this.log.debug(`Skip polling for device: ${device.name} (not reachable)`);
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
                        device,
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
                        device,
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
                    device,
                );
                if (!res) {
                    return this.log.error(
                        `An error has occured while trying to set Device ${device.name} fan speed to ${state.val}`,
                    );
                }
                this.log.debug(`DEBUG: Setting ACK id ${id} to true`);
                this.setState(id, state.val, true);
            } else if (id.includes('.powerOn')) {
                const res = await this.sendHttpRequest(`http://${device.ip}:${device.port}/?power=on`, device);
                if (!res) {
                    return this.log.error(`An error has occured while trying to power on device ${device.name}`);
                }
                await this.setState(id, false, true);
            } else if (id.includes('.powerOff')) {
                const res = await this.sendHttpRequest(`http://${device.ip}:${device.port}/?power=off`, device);
                if (!res) {
                    return this.log.error(`An error has occured while trying to power off device ${device.name}`);
                }
                await this.setState(id, false, true);
            } else if (id.includes('.autoMode')) {
                const res = await this.sendHttpRequest(`http://${device.ip}:${device.port}/?speed=0`, device);
                if (!res) {
                    return this.log.error(
                        `An error has occured while trying to set automatic mode for device ${device.name}`,
                    );
                }
                await this.setState(id, false, true);
            } else if (id.includes('.togglePower')) {
                const res = await this.sendHttpRequest(`http://${device.ip}:${device.port}/?button=power`, device);
                if (!res) {
                    return this.log.error(
                        `An error has occured while trying to send power button for device ${device.name}`,
                    );
                }
                await this.setState(id, false, true);
            } else if (id.includes('.timer')) {
                const res = await this.sendHttpRequest(`http://${device.ip}:${device.port}/?button=timer`, device);
                if (!res) {
                    return this.log.error(
                        `An error has occured while trying to send power button to device ${device.name}`,
                    );
                }
                await this.setState(id, false, true);
            } else if (id.includes('.syncTime')) {
                const res = await this.sendHttpRequest(
                    `http://${device.ip}:${device.port}/index.html?TimeSync=1`,
                    device,
                );
                if (!res) {
                    return this.log.error(`An error has occured while trying to sync time for device ${device.name}`);
                }
                await this.setState(id, false, true);
            }
            this.queryDevice(device);
        }
    }

    /**
     * Create device objects
     */
    async createDeviceObjects() {
        this.log.debug(`createDeviceObjects()`);

        for (const id in this.devices) {
            const device = this.devices[id];
            this.log.debug(`creating objects for device ${id} - ${device.name} - ${device.ip}:${device.port}`);

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
                            en: 'Device is reachable',
                            de: 'Gerät ist erreichbar',
                            ru: 'Устройство доступно',
                            pt: 'O dispositivo está acessível',
                            nl: 'Apparaat is bereikbaar',
                            fr: "L'appareil est joignable",
                            it: 'Il dispositivo è raggiungibile',
                            es: 'Dispositivo accesible',
                            pl: 'Urządzenie jest osiągalne',
                            uk: 'Пристрій доступний',
                            'zh-cn': 'Device is reachable',
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
                            en: 'Date on the device',
                            de: 'Datum auf dem Gerät',
                            ru: 'Дата на устройстве',
                            pt: 'Data no dispositivo',
                            nl: 'Datum op het apparaat',
                            fr: "Date sur l'appareil",
                            it: 'Data del dispositivo',
                            es: 'Fecha en el dispositivo',
                            pl: 'Data na urządzeniu',
                            uk: 'Дата на пристрої',
                            'zh-cn': 'Date on the device',
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
                            en: 'Time on the device',
                            de: 'Zeit auf dem Gerät',
                            ru: 'Время работы на устройстве',
                            pt: 'Tempo no dispositivo',
                            nl: 'Tijd op het apparaat',
                            fr: "Temps passé sur l'appareil",
                            it: 'Tempo di permanenza sul dispositivo',
                            es: 'Tiempo en el dispositivo',
                            pl: 'Czas na urządzeniu',
                            uk: 'Час на пристрої',
                            'zh-cn': 'Time on the device',
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
                            en: 'Name of the device',
                            de: 'Name des Geräts',
                            ru: 'Имя устройства',
                            pt: 'Nome do dispositivo',
                            nl: 'Naam van het apparaat',
                            fr: "Nom de l'appareil",
                            it: 'Nome del dispositivo',
                            es: 'Nombre del dispositivo',
                            pl: 'Nazwa urządzenia',
                            uk: 'Назва пристрою',
                            'zh-cn': 'Name of the device',
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
                            en: 'MAC address of the device',
                            de: 'MAC-Adresse des Geräts',
                            ru: 'MAC-адрес устройства',
                            pt: 'Endereço MAC do dispositivo',
                            nl: 'MAC-adres van het apparaat',
                            fr: "Adresse MAC de l'appareil",
                            it: 'Indirizzo MAC del dispositivo',
                            es: 'Dirección MAC del dispositivo',
                            pl: 'Adres MAC urządzenia',
                            uk: 'MAC-адреса пристрою',
                            'zh-cn': 'MAC address of the device',
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
                            en: 'IP address of the device',
                            de: 'IP-Adresse des Geräts',
                            ru: 'IP-адрес устройства',
                            pt: 'Endereço IP do dispositivo',
                            nl: 'IP-adres van het apparaat',
                            fr: "Adresse IP de l'appareil",
                            it: 'Indirizzo IP del dispositivo',
                            es: 'Dirección IP del dispositivo',
                            pl: 'Adres IP urządzenia',
                            uk: 'IP-адреса пристрою',
                            'zh-cn': 'IP address of the device',
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
                            en: 'Received signal-strength indication',
                            de: 'Anzeige der Stärke des empfangenen Signals',
                            ru: 'Индикация уровня принимаемого сигнала',
                            pt: 'Indicação da intensidade do sinal recebido',
                            nl: 'Signaalsterkte-indicatie ontvangen',
                            fr: "Indication de l'intensité du signal reçu",
                            it: "Indicazione dell'intensità del segnale ricevuto",
                            es: 'Indicación de la intensidad de la señal recibida',
                            pl: 'Wskazanie siły odbieranego sygnału',
                            uk: 'Індикація рівня прийнятого сигналу',
                            'zh-cn': 'Received signal-strength indication',
                        },
                        type: 'number',
                        role: 'value',
                        unit: 'dBm',
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
                            en: 'Firmware version of main controller',
                            de: 'Firmware-Version des Hauptcontrollers',
                            ru: 'Версия микропрограммы главного контроллера',
                            pt: 'Versão do firmware do controlador principal',
                            nl: 'Firmwareversie van hoofdcontroller',
                            fr: 'Version du micrologiciel du contrôleur principal',
                            it: 'Versione del firmware del controllore principale',
                            es: 'Versión del firmware del controlador principal',
                            pl: 'Wersja oprogramowania sprzętowego głównego kontrolera',
                            uk: 'Версія прошивки головного контролера',
                            'zh-cn': 'Firmware version of main controller',
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
                            en: 'Firmware version of WLAN module',
                            de: 'Firmware-Version des WLAN-Moduls',
                            ru: 'Версия микропрограммы модуля WLAN',
                            pt: 'Versão do firmware do módulo WLAN',
                            nl: 'Firmwareversie van WLAN-module',
                            fr: 'Version du micrologiciel du module WLAN',
                            it: 'Versione del firmware del modulo WLAN',
                            es: 'Versión del firmware del módulo WLAN',
                            pl: 'Wersja oprogramowania układowego modułu WLAN',
                            uk: 'Версія прошивки модуля бездротової локальної мережі',
                            'zh-cn': 'Firmware version of WLAN module',
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
                            en: 'Device turned on',
                            de: 'Gerät ist eingeschaltet',
                            ru: 'Устройство включено',
                            pt: 'Dispositivo ligado',
                            nl: 'Apparaat ingeschakeld',
                            fr: 'Appareil allumé',
                            it: 'Dispositivo acceso',
                            es: 'Dispositivo encendido',
                            pl: 'Urządzenie włączone',
                            uk: 'Пристрій увімкнено',
                            'zh-cn': 'Device turned on',
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
                            en: 'Temperature of supply air',
                            de: 'Temperatur der Zuluft',
                            ru: 'Температура приточного воздуха',
                            pt: 'Temperatura do ar de alimentação',
                            nl: 'Temperatuur van toevoerlucht',
                            fr: "Température de l'air soufflé",
                            it: "Temperatura dell'aria di mandata",
                            es: 'Temperatura del aire de impulsión',
                            pl: 'Temperatura powietrza nawiewanego',
                            uk: 'Температура припливного повітря',
                            'zh-cn': 'Temperature of supply air',
                        },
                        type: 'number',
                        unit: '°C',
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
                            en: 'Temperature of exhaust air',
                            de: 'Temperatur der Abluft',
                            ru: 'Температура отработанного воздуха',
                            pt: 'Temperatura do ar de escape',
                            nl: 'Temperatuur van uitlaatlucht',
                            fr: "Température de l'air d'échappement",
                            it: "Temperatura dell'aria di scarico",
                            es: 'Temperatura del aire de escape',
                            pl: 'Temperatura powietrza wylotowego',
                            uk: 'Температура відпрацьованого повітря',
                            'zh-cn': 'Temperature of exhaust air',
                        },
                        type: 'number',
                        unit: '°C',
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
                            en: 'Temperature of the fresh air',
                            de: 'Temperatur der Frischluft',
                            ru: 'Температура свежего воздуха',
                            pt: 'Temperatura do ar fresco',
                            nl: 'Temperatuur van de buitenlucht',
                            fr: "Température de l'air frais",
                            it: "Temperatura dell'aria fresca",
                            es: 'Temperatura del aire fresco',
                            pl: 'Temperatura świeżego powietrza',
                            uk: 'Температура свіжого повітря',
                            'zh-cn': 'Temperature of the fresh air',
                        },
                        type: 'number',
                        role: 'value.temperature',
                        unit: '°C',
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
                            en: 'Relative humidity of supply air',
                            de: 'Relative Luftfeuchtigkeit der Zuluft',
                            ru: 'Относительная влажность приточного воздуха',
                            pt: 'Humidade relativa do ar de alimentação',
                            nl: 'Relatieve vochtigheid van toevoerlucht',
                            fr: "Humidité relative de l'air soufflé",
                            it: "Umidità relativa dell'aria di alimentazione",
                            es: 'Humedad relativa del aire de impulsión',
                            pl: 'Wilgotność względna powietrza nawiewanego',
                            uk: 'Відносна вологість припливного повітря',
                            'zh-cn': 'Relative humidity of supply air',
                        },
                        type: 'number',
                        unit: '%',
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
                            en: 'Relative humidity of exhaust air',
                            de: 'Relative Luftfeuchtigkeit der Abluft',
                            ru: 'Относительная влажность вытяжного воздуха',
                            pt: 'Humidade relativa do ar de exaustão',
                            nl: 'Relatieve vochtigheid van afvoerlucht',
                            fr: "Humidité relative de l'air extrait",
                            it: "Umidità relativa dell'aria di scarico",
                            es: 'Humedad relativa del aire de escape',
                            pl: 'Wilgotność względna powietrza wylotowego',
                            uk: 'Відносна вологість відпрацьованого повітря',
                            'zh-cn': 'Relative humidity of exhaust air',
                        },
                        type: 'number',
                        unit: '%',
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
                            en: 'Absolute humidity of supply air',
                            de: 'Absolute Luftfeuchtigkeit der Zuluft',
                            ru: 'Абсолютная влажность приточного воздуха',
                            pt: 'Humidade absoluta do ar de alimentação',
                            nl: 'Absolute vochtigheid van toevoerlucht',
                            fr: "Humidité absolue de l'air soufflé",
                            it: "Umidità assoluta dell'aria di mandata",
                            es: 'Humedad absoluta del aire de impulsión',
                            pl: 'Wilgotność bezwzględna powietrza nawiewanego',
                            uk: 'Абсолютна вологість припливного повітря',
                            'zh-cn': 'Absolute humidity of supply air',
                        },
                        type: 'number',
                        unit: 'g/m³',
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
                            en: 'Absolute humidity of exhaust air',
                            de: 'Absolute Feuchtigkeit der Abluft',
                            ru: 'Абсолютная влажность вытяжного воздуха',
                            pt: 'Humidade absoluta do ar de exaustão',
                            nl: 'Absolute vochtigheid van afvoerlucht',
                            fr: "Humidité absolue de l'air vicié",
                            it: "Umidità assoluta dell'aria di scarico",
                            es: 'Humedad absoluta del aire de escape',
                            pl: 'Wilgotność bezwzględna powietrza wylotowego',
                            uk: 'Абсолютна вологість відпрацьованого повітря',
                            'zh-cn': 'Absolute humidity of exhaust air',
                        },
                        type: 'number',
                        unit: 'g/m³',
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
                            en: 'Efficiency of heat recovery',
                            de: 'Effizienz der Wärmerückgewinnung',
                            ru: 'Эффективность рекуперации тепла',
                            pt: 'Eficiência da recuperação de calor',
                            nl: 'Efficiëntie van warmteterugwinning',
                            fr: 'Efficacité de la récupération de chaleur',
                            it: 'Efficienza del recupero di calore',
                            es: 'Eficacia de la recuperación de calor',
                            pl: 'Wydajność odzysku ciepła',
                            uk: 'Ефективність рекуперації тепла',
                            'zh-cn': 'Efficiency of heat recovery',
                        },
                        type: 'number',
                        unit: '%',
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
                            en: 'Humidity transport',
                            de: 'Transport von Luftfeuchtigkeit',
                            ru: 'Перенос влажности',
                            pt: 'Transporte de humidade',
                            nl: 'Vochtigheids transport',
                            fr: "Transport de l'humidité",
                            it: "Trasporto dell'umidità",
                            es: 'Transporte de humedad',
                            pl: 'Transport wilgoci',
                            uk: 'Перенесення вологості',
                            'zh-cn': 'Humidity transport',
                        },
                        type: 'number',
                        unit: 'g/24h',
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
                            en: 'Speed of supply air fan',
                            de: 'Drehzahl des Zuluftventilators',
                            ru: 'Скорость вентилятора приточного воздуха',
                            pt: 'Velocidade do ventilador de fornecimento de ar',
                            nl: 'Snelheid van toevoerluchtventilator',
                            fr: 'Vitesse du ventilateur de soufflage',
                            it: "Velocità del ventilatore dell'aria di alimentazione",
                            es: 'Velocidad del ventilador de impulsión',
                            pl: 'Prędkość wentylatora nawiewnego',
                            uk: 'Швидкість обертання вентилятора припливного повітря',
                            'zh-cn': 'Speed of supply air fan',
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
                            en: 'Speed of exhaust air fan',
                            de: 'Drehzahl des Abluftventilators',
                            ru: 'Скорость вентилятора вытяжного воздуха',
                            pt: 'Velocidade da ventoinha de extração de ar',
                            nl: 'Snelheid van afzuigventilator',
                            fr: "Vitesse du ventilateur d'extraction",
                            it: "Velocità del ventilatore dell'aria di scarico",
                            es: 'Velocidad del extractor de aire',
                            pl: 'Prędkość wentylatora wyciągowego',
                            uk: 'Швидкість вентилятора витяжного повітря',
                            'zh-cn': 'Speed of exhaust air fan',
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
                            en: 'Speed of antifreeze fan',
                            de: 'Drehzahl des Frostschutzgebläses',
                            ru: 'Скорость вентилятора антифриза',
                            pt: 'Velocidade do ventilador do anticongelante',
                            nl: 'Snelheid van antivriesventilator',
                            fr: 'Vitesse du ventilateur antigel',
                            it: 'Velocità della ventola antigelo',
                            es: 'Velocidad del ventilador anticongelante',
                            pl: 'Prędkość wentylatora przeciwzamrożeniowego',
                            uk: 'Швидкість обертання вентилятора антифризу',
                            'zh-cn': 'Speed of antifreeze fan',
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
                            en: 'Antifreeze is active',
                            de: 'Frostschutzmittel ist aktiv',
                            ru: 'Антифриз активен',
                            pt: 'O anticongelante está ativo',
                            nl: 'Antivries is actief',
                            fr: "L'antigel est actif",
                            it: "L'antigelo è attivo",
                            es: 'El anticongelante está activo',
                            pl: 'Środek przeciw zamarzaniu jest aktywny',
                            uk: 'Антифриз активний',
                            'zh-cn': 'Antifreeze is active',
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
                            en: 'Fixed speed is active',
                            de: 'Feste Geschwindigkeit ist aktiv',
                            ru: 'Фиксированная скорость активна',
                            pt: 'A velocidade fixa está ativa',
                            nl: 'Vaste snelheid is actief',
                            fr: 'La vitesse fixe est active',
                            it: 'La velocità fissa è attiva',
                            es: 'Velocidad fija activa',
                            pl: 'Stała prędkość jest aktywna',
                            uk: 'Фіксована швидкість активна',
                            'zh-cn': 'Fixed speed is active',
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
                            en: 'Defrost mode is active',
                            de: 'Abtaumodus ist aktiv',
                            ru: 'Режим размораживания активен',
                            pt: 'O modo de descongelação está ativo',
                            nl: 'Ontdooimodus is actief',
                            fr: 'Le mode dégivrage est actif',
                            it: 'La modalità di sbrinamento è attiva',
                            es: 'Modo de descongelación activo',
                            pl: 'Tryb odszraniania jest aktywny',
                            uk: 'Режим розморожування активний',
                            'zh-cn': 'Defrost mode is active',
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
                            en: 'Landlord mode is active',
                            de: 'Vermieter-Modus ist aktiv',
                            ru: 'Режим арендодателя активен',
                            pt: 'O modo senhorio está ativo',
                            nl: 'Verhuurdersmodus is actief',
                            fr: 'Le mode propriétaire est actif',
                            it: 'La modalità locatore è attiva',
                            es: 'El modo propietario está activo',
                            pl: 'Tryb właściciela jest aktywny',
                            uk: 'Режим орендодавця активний',
                            'zh-cn': 'Landlord mode is active',
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
                            en: 'Cross ventilation mode is active',
                            de: 'Querlüftungsmodus ist aktiv',
                            ru: 'Режим перекрестной вентиляции активен',
                            pt: 'O modo de ventilação cruzada está ativo',
                            nl: 'Dwarsventilatiemodus is actief',
                            fr: 'Le mode de ventilation transversale est actif',
                            it: 'La modalità di ventilazione incrociata è attiva',
                            es: 'El modo de ventilación cruzada está activado',
                            pl: 'Aktywny jest tryb wentylacji poprzecznej',
                            uk: 'Активний режим перехресної вентиляції',
                            'zh-cn': 'Cross ventilation mode is active',
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
                            en: 'Timer is active',
                            de: 'Timer ist aktiv',
                            ru: 'Таймер активен',
                            pt: 'O temporizador está ativo',
                            nl: 'Timer is actief',
                            fr: 'La minuterie est active',
                            it: 'Il timer è attivo',
                            es: 'Temporizador activo',
                            pl: 'Timer jest aktywny',
                            uk: 'Таймер активний',
                            'zh-cn': 'Timer is active',
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

            // Create commands
            await this.extendObject(
                `${device.id}.commands.setFanSpeed`,
                {
                    type: 'state',
                    common: {
                        name: {
                            en: 'Set speed of supply and exhaust air fan (0-10)',
                            de: 'Geschwindigkeit der Zu- und Abluftventilatoren einstellen (0-10)',
                            ru: 'Установка скорости вентилятора приточного и вытяжного воздуха (0-10)',
                            pt: 'Regular a velocidade do ventilador de alimentação e de extração de ar (0-10)',
                            nl: 'Snelheid van toevoer- en afvoerluchtventilator instellen (0-10)',
                            fr: "Réglage de la vitesse des ventilateurs de soufflage et d'extraction (0-10)",
                            it: "Impostazione della velocità del ventilatore dell'aria di mandata e di scarico (0-10)",
                            es: 'Velocidad del ventilador de impulsión y extracción (0-10)',
                            pl: 'Ustawienie prędkości wentylatora nawiewnego i wywiewnego (0-10)',
                            uk: 'Встановіть швидкість припливного та витяжного вентилятора (0-10)',
                            'zh-cn': 'Set speed of supply and exhaust air fan (0-10)',
                        },
                        type: 'number',
                        role: 'level.speed',
                        read: true,
                        write: true,
                        min: 0,
                        max: 10,
                        def: 0,
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
                            en: 'Set speed of supply air fan (0-10) - only when device is turned off',
                            de: 'Geschwindigkeit des Zuluftventilators einstellen (0-10) - nur bei ausgeschaltetem Gerät',
                            ru: 'Установка скорости вентилятора приточного воздуха (0-10) - только при выключенном устройстве',
                            pt: 'Definir a velocidade da ventoinha de fornecimento de ar (0-10) - apenas quando o dispositivo está desligado',
                            nl: 'Snelheid toevoerluchtventilator instellen (0-10) - alleen wanneer apparaat is uitgeschakeld',
                            fr: "Régler la vitesse du ventilateur de soufflage (0-10) - uniquement lorsque l'appareil est éteint",
                            it: "Impostazione della velocità del ventilatore dell'aria di mandata (0-10) - solo a dispositivo spento",
                            es: 'Velocidad del ventilador de impulsión (0-10) - sólo con el aparato apagado',
                            pl: 'Ustawienie prędkości wentylatora nawiewnego (0-10) - tylko gdy urządzenie jest wyłączone',
                            uk: 'Налаштування швидкості вентилятора припливного повітря (0-10) - тільки коли пристрій вимкнено',
                            'zh-cn': 'Set speed of supply air fan (0-10) - only when device is turned off',
                        },
                        type: 'number',
                        role: 'level.speed',
                        read: true,
                        write: true,
                        min: 0,
                        max: 10,
                        def: 0,
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
                            en: 'Set speed of exhaust air fan (0-10) - only when device is turned off',
                            de: 'Drehzahl des Abluftventilators einstellen (0-10) - nur bei ausgeschaltetem Gerät',
                            ru: 'Установка скорости вентилятора вытяжного воздуха (0-10) - только при выключенном устройстве',
                            pt: 'Regular a velocidade do ventilador de extração do ar (0-10) - apenas quando o dispositivo está desligado',
                            nl: 'Snelheid van afzuigventilator instellen (0-10) - alleen wanneer apparaat is uitgeschakeld',
                            fr: "Régler la vitesse du ventilateur d'extraction (0-10) - uniquement lorsque l'appareil est éteint",
                            it: "Impostazione della velocità del ventilatore dell'aria di scarico (0-10) - solo a dispositivo spento",
                            es: 'Ajuste de la velocidad del extractor de aire (0-10) - sólo con el aparato apagado',
                            pl: 'Ustawienie prędkości wentylatora wyciągowego (0-10) - tylko gdy urządzenie jest wyłączone',
                            uk: 'Встановлення швидкості вентилятора витяжного повітря (0-10) - тільки при вимкненому пристрої',
                            'zh-cn': 'Set speed of exhaust air fan (0-10) - only when device is turned off',
                        },
                        type: 'number',
                        role: 'level.speed',
                        read: true,
                        write: true,
                        min: 0,
                        max: 10,
                        def: 0,
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
                            en: 'Set speed of antifreeze fan (0-50) - only when device is turned off',
                            de: 'Geschwindigkeit des Frostschutzgebläses einstellen (0-50) - nur bei ausgeschaltetem Gerät',
                            ru: 'Установка скорости вращения вентилятора антифриза (0-50) - только при выключенном устройстве',
                            pt: 'Definir a velocidade da ventoinha do anticongelante (0-50) - apenas quando o dispositivo está desligado',
                            nl: 'Snelheid antivriesventilator instellen (0-50) - alleen wanneer apparaat is uitgeschakeld',
                            fr: "Régler la vitesse du ventilateur antigel (0-50) - uniquement lorsque l'appareil est éteint",
                            it: 'Impostazione della velocità della ventola antigelo (0-50) - solo a dispositivo spento',
                            es: 'Ajustar la velocidad del ventilador anticongelante (0-50) - sólo con el aparato apagado',
                            pl: 'Ustawienie prędkości wentylatora przeciwzamrożeniowego (0-50) - tylko gdy urządzenie jest wyłączone',
                            uk: 'Налаштування швидкості вентилятора антифризу (0-50) - тільки коли пристрій вимкнено',
                            'zh-cn': 'Set speed of antifreeze fan (0-50) - only when device is turned off',
                        },
                        type: 'number',
                        role: 'level.speed',
                        read: true,
                        write: true,
                        min: 0,
                        max: 50,
                        def: 0,
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
                            en: 'Turn on device',
                            de: 'Gerät einschalten',
                            ru: 'Включите устройство',
                            pt: 'Ligar o dispositivo',
                            nl: 'Apparaat inschakelen',
                            fr: "Allumer l'appareil",
                            it: 'Accendere il dispositivo',
                            es: 'Encender el dispositivo',
                            pl: 'Włącz urządzenie',
                            uk: 'Увімкніть пристрій',
                            'zh-cn': 'Turn on device',
                        },
                        type: 'boolean',
                        role: 'button',
                        read: false,
                        write: true,
                        def: false,
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
                            en: 'Turn off device',
                            de: 'Gerät ausschalten',
                            ru: 'Выключите устройство',
                            pt: 'Desligar o dispositivo',
                            nl: 'Apparaat uitschakelen',
                            fr: "Éteindre l'appareil",
                            it: 'Spegnere il dispositivo',
                            es: 'Apagar el dispositivo',
                            pl: 'Wyłącz urządzenie',
                            uk: 'Вимкніть пристрій',
                            'zh-cn': 'Turn off device',
                        },
                        type: 'boolean',
                        role: 'button',
                        read: false,
                        write: true,
                        def: false,
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
                            en: 'Turn on/off device',
                            de: 'Gerät ein-/ausschalten',
                            ru: 'Включить/выключить устройство',
                            pt: 'Ligar/desligar o dispositivo',
                            nl: 'Apparaat in-/uitschakelen',
                            fr: "Allumer/éteindre l'appareil",
                            it: 'Accendere/spegnere il dispositivo',
                            es: 'Encender/apagar el dispositivo',
                            pl: 'Włączanie/wyłączanie urządzenia',
                            uk: 'Увімкнення/вимкнення пристрою',
                            'zh-cn': 'Turn on/off device',
                        },
                        type: 'boolean',
                        role: 'button',
                        read: false,
                        write: true,
                        def: false,
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
                            en: 'Activate automatic mode',
                            de: 'Aktivieren Sie den Automatikmodus',
                            ru: 'Активация автоматического режима',
                            pt: 'Ativar o modo automático',
                            nl: 'Automatische modus activeren',
                            fr: 'Activer le mode automatique',
                            it: 'Attivare la modalità automatica',
                            es: 'Activar el modo automático',
                            pl: 'Aktywacja trybu automatycznego',
                            uk: 'Увімкнути автоматичний режим',
                            'zh-cn': 'Activate automatic mode',
                        },
                        type: 'boolean',
                        role: 'button',
                        read: false,
                        write: true,
                        def: false,
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
                            en: 'Activate timer',
                            de: 'Timer einschalten',
                            ru: 'Активировать таймер',
                            pt: 'Ativar o temporizador',
                            nl: 'Timer activeren',
                            fr: 'Activer la minuterie',
                            it: 'Attivare il timer',
                            es: 'Activar temporizador',
                            pl: 'Aktywacja timera',
                            uk: 'Активувати таймер',
                            'zh-cn': 'Activate timer',
                        },
                        type: 'boolean',
                        role: 'button',
                        read: false,
                        write: true,
                        def: false,
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
                            en: 'Synchronize date and time of device with time server',
                            de: 'Datum und Uhrzeit des Geräts mit dem Zeitserver synchronisieren',
                            ru: 'Синхронизация даты и времени устройства с сервером времени',
                            pt: 'Sincronizar a data e a hora do dispositivo com o servidor de hora',
                            nl: 'Datum en tijd van apparaat synchroniseren met tijdserver',
                            fr: "Synchroniser la date et l'heure de l'appareil avec le serveur de temps",
                            it: "Sincronizzare la data e l'ora del dispositivo con il server orario",
                            es: 'Sincronizar fecha y hora del dispositivo con el servidor horario',
                            pl: 'Synchronizacja daty i godziny urządzenia z serwerem czasu',
                            uk: 'Синхронізація дати та часу пристрою з сервером часу',
                            'zh-cn': 'Synchronize date and time of device with time server',
                        },
                        type: 'boolean',
                        role: 'button',
                        read: false,
                        write: true,
                        def: false,
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
     * @param device device object
     */
    async sendHttpRequest(url, device) {
        this.log.debug(`sendHttpRequest(${url}, ${device.name})`);

        let response = null;
        try {
            response = await NodeFetch(url);
        } catch (error) {
            if (error.code == 'ETIMEDOUT') {
                this.log.error(
                    `An error has occured while trying to send request to device ${device.name}. The Connection timed out!`,
                );
                return null;
            }
            if (error.code == 'ECONNREFUSED') {
                this.log.error(
                    `An error has occured while trying to send request to device ${device.name}. The Connection has been refused!`,
                );
                return null;
            }
            this.log.error(`An unexpected error has occred while trying to send request to device ${device.name}.`);
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
