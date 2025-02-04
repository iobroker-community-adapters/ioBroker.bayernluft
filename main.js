'use strict';

/*
 * Created with @iobroker/create-adapter v2.3.0
 *
 */

const utils = require('@iobroker/adapter-core');
const NodeFetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

class Bayernluft extends utils.Adapter {
    /**
     * @param [options]
     */
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
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Reset the connection indicator during startup
        await this.setStateAsync('info.connection', false, true);

        if (this.config.devices == null) {
            this.log.error('No devices has been set, disabling adapter!');
            this.disable();
            return;
        }
        //initial check
        await this.checkDevices();

        // Indicate that the connection has been established
        await this.setStateAsync('info.connection', true, true);

        //setup polling at interval
        this.pollInterval = this.setInterval(async () => {
            await this.checkDevices();
        }, this.config.pollInterval * 1000);
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param callback
     */
    async onUnload(callback) {
        try {
            await this.setStateAsync('info.connection', false, true);
            this.pollInterval && this.clearInterval(this.pollInterval);
            callback();
        } catch {
            callback();
        }
    }

    /**
     * Checking Devices and updating Objects/States
     */
    async checkDevices() {
        for await (const device of this.GetDevices() || []) {
            this.log.debug(`Polling data for device: ${device.name}`);
            const exporttxt = await this.GetHttpRequest(`http://${device.ip}:${device.port}/export.txt`, device.name);
            const deviceInfo = await this.GetHttpRequest(
                `http://${device.ip}:${device.port}/index.html?export=1&decimal=point`,
                device.name,
            );

            if (exporttxt == null || deviceInfo == null) {
                continue;
            }

            // Create Data Objects
            await this.setObjectNotExistsAsyncEasy(
                `${device.name}.data.date`,
                'state',
                exporttxt.data.date.replaceAll('~', ''),
                deviceInfo.data.date,
                'string',
                'indicator',
                true,
                false,
            );
            await this.setObjectNotExistsAsyncEasy(
                `${device.name}.data.time`,
                'state',
                exporttxt.data.time.replaceAll('~', ''),
                deviceInfo.data.time,
                'string',
                'indicator',
                true,
                false,
            );
            await this.setObjectNotExistsAsyncEasy(
                `${device.name}.data.name`,
                'state',
                exporttxt.data.name.replaceAll('~', ''),
                deviceInfo.data.name,
                'string',
                'indicator',
                true,
                false,
            );
            await this.setObjectNotExistsAsyncEasy(
                `${device.name}.data.mac`,
                'state',
                exporttxt.data.mac.replaceAll('~', ''),
                deviceInfo.data.mac,
                'string',
                'indicator',
                true,
                false,
            );
            await this.setObjectNotExistsAsyncEasy(
                `${device.name}.data.localip`,
                'state',
                exporttxt.data.local_IP.replaceAll('~', ''),
                deviceInfo.data.local_IP,
                'string',
                'indicator',
                true,
                false,
            );
            await this.setObjectNotExistsAsyncEasy(
                `${device.name}.data.rssi`,
                'state',
                exporttxt.data.rssi.replaceAll('~', ''),
                deviceInfo.data.rssi,
                'string',
                'indicator',
                true,
                false,
            );
            await this.setObjectNotExistsAsyncEasy(
                `${device.name}.data.fw_maincontroller`,
                'state',
                exporttxt.data.fw_MainController.replaceAll('~', ''),
                deviceInfo.data.fw_MainController,
                'string',
                'indicator',
                true,
                false,
            );
            await this.setObjectNotExistsAsyncEasy(
                `${device.name}.data.fw_wifi`,
                'state',
                exporttxt.data.fw_WiFi.replaceAll('~', ''),
                deviceInfo.data.fw_WiFi,
                'string',
                'indicator',
                true,
                false,
            );

            // Create Parameter Objects
            await this.setObjectNotExistsAsyncEasy(
                `${device.name}.parameter.temperature_in`,
                'state',
                exporttxt.parameter.temperature_In.replaceAll('~', ''),
                parseFloat(deviceInfo.parameter.temperature_In),
                'number',
                'indicator',
                true,
                false,
            );
            await this.setObjectNotExistsAsyncEasy(
                `${device.name}.parameter.temperature_out`,
                'state',
                exporttxt.parameter.temperature_Out.replaceAll('~', ''),
                parseFloat(deviceInfo.parameter.temperature_Out),
                'number',
                'indicator',
                true,
                false,
            );
            await this.setObjectNotExistsAsyncEasy(
                `${device.name}.parameter.temperature_fresh`,
                'state',
                exporttxt.parameter.temperature_Fresh.replaceAll('~', ''),
                parseFloat(deviceInfo.parameter.temperature_Fresh),
                'number',
                'indicator',
                true,
                false,
            );
            await this.setObjectNotExistsAsyncEasy(
                `${device.name}.parameter.rel_humidity_in`,
                'state',
                exporttxt.parameter.rel_Humidity_In.replaceAll('~', ''),
                parseFloat(deviceInfo.parameter.rel_Humidity_In),
                'number',
                'indicator',
                true,
                false,
            );
            await this.setObjectNotExistsAsyncEasy(
                `${device.name}.parameter.rel_humidity_out`,
                'state',
                exporttxt.parameter.rel_Humidity_Out.replaceAll('~', ''),
                parseFloat(deviceInfo.parameter.rel_Humidity_Out),
                'number',
                'indicator',
                true,
                false,
            );
            await this.setObjectNotExistsAsyncEasy(
                `${device.name}.parameter.abs_humidity_in`,
                'state',
                exporttxt.parameter.abs_Humidity_In.replaceAll('~', ''),
                parseFloat(deviceInfo.parameter.abs_Humidity_In),
                'number',
                'indicator',
                true,
                false,
            );
            await this.setObjectNotExistsAsyncEasy(
                `${device.name}.parameter.abs_humidity_out`,
                'state',
                exporttxt.parameter.abs_Humidity_Out.replaceAll('~', ''),
                parseFloat(deviceInfo.parameter.abs_Humidity_Out),
                'number',
                'indicator',
                true,
                false,
            );
            await this.setObjectNotExistsAsyncEasy(
                `${device.name}.parameter.efficiency`,
                'state',
                exporttxt.parameter.efficiency.replaceAll('~', ''),
                parseFloat(deviceInfo.parameter.efficiency),
                'number',
                'indicator',
                true,
                false,
            );
            await this.setObjectNotExistsAsyncEasy(
                `${device.name}.parameter.humidity_transport`,
                'state',
                exporttxt.parameter.humidity_Transport.replaceAll('~', ''),
                parseInt(deviceInfo.parameter.humidity_Transport),
                'number',
                'indicator',
                true,
                false,
            );

            // Create States Objects
            await this.setObjectNotExistsAsyncEasy(
                `${device.name}.states.speed_in`,
                'state',
                exporttxt.states.speed_In.replaceAll('~', ''),
                parseInt(deviceInfo.states.speed_In),
                'number',
                'indicator',
                true,
                true,
            );
            await this.setObjectNotExistsAsyncEasy(
                `${device.name}.states.speed_out`,
                'state',
                exporttxt.states.speed_Out.replaceAll('~', ''),
                parseInt(deviceInfo.states.speed_Out),
                'number',
                'indicator',
                true,
                true,
            );
            await this.setObjectNotExistsAsyncEasy(
                `${device.name}.states.speed_antifreeze`,
                'state',
                exporttxt.states.speed_antiFreeze.replaceAll('~', ''),
                parseInt(deviceInfo.states.speed_antiFreeze),
                'number',
                'indicator',
                true,
                true,
            );
            await this.setObjectNotExistsAsyncEasy(
                `${device.name}.states.systemon`,
                'state',
                exporttxt.states.SystemOn.replaceAll('~', ''),
                parseInt(deviceInfo.states.SystemOn),
                'number',
                'indicator',
                true,
                true,
            );
            await this.setObjectNotExistsAsyncEasy(
                `${device.name}.states.Antifreeze`,
                'state',
                exporttxt.states.AntiFreeze.replaceAll('~', ''),
                parseInt(deviceInfo.states.AntiFreeze),
                'number',
                'indicator',
                true,
                true,
            );
            await this.setObjectNotExistsAsyncEasy(
                `${device.name}.states.fixed_speed`,
                'state',
                exporttxt.states.Fixed_Speed.replaceAll('~', ''),
                parseInt(deviceInfo.states.Fixed_Speed),
                'number',
                'indicator',
                true,
                true,
            );
            await this.setObjectNotExistsAsyncEasy(
                `${device.name}.states.defrosting`,
                'state',
                exporttxt.states.Defrosting.replaceAll('~', ''),
                parseInt(deviceInfo.states.Defrosting),
                'number',
                'indicator',
                true,
                true,
            );
            await this.setObjectNotExistsAsyncEasy(
                `${device.name}.states.landlord_mode`,
                'state',
                exporttxt.states.Landlord_Mode.replaceAll('~', ''),
                parseInt(deviceInfo.states.Landlord_Mode),
                'number',
                'indicator',
                true,
                true,
            );
            await this.setObjectNotExistsAsyncEasy(
                `${device.name}.states.cross_ventilation`,
                'state',
                exporttxt.states.Cross_Ventilation.replaceAll('~', ''),
                parseInt(deviceInfo.states.Cross_Ventilation),
                'number',
                'indicator',
                true,
                true,
            );
            await this.setObjectNotExistsAsyncEasy(
                `${device.name}.states.timer_active`,
                'state',
                exporttxt.states.Timer_active.replaceAll('~', ''),
                parseInt(deviceInfo.states.Timer_active),
                'number',
                'indicator',
                true,
                true,
            );

            // Create Commands
            await this.setObjectNotExistsAsyncEasy(
                `${device.name}.commands.setSpeed`,
                'state',
                'Speed',
                1,
                'number',
                'level',
                true,
                true,
                1,
                10,
            );
            await this.setObjectNotExistsAsyncEasy(
                `${device.name}.commands.powerOn`,
                'state',
                'Power On',
                false,
                'boolean',
                'button',
                false,
                true,
            );
            await this.setObjectNotExistsAsyncEasy(
                `${device.name}.commands.powerOff`,
                'state',
                'Power Off',
                false,
                'boolean',
                'button',
                false,
                true,
            );
            await this.setObjectNotExistsAsyncEasy(
                `${device.name}.commands.setAuto`,
                'state',
                'Automatic Mode',
                false,
                'boolean',
                'button',
                false,
                true,
            );
            await this.setObjectNotExistsAsyncEasy(
                `${device.name}.commands.buttonPower`,
                'state',
                'Power Button',
                false,
                'boolean',
                'button',
                false,
                true,
            );
            await this.setObjectNotExistsAsyncEasy(
                `${device.name}.commands.buttonTimer`,
                'state',
                'Timer Button',
                false,
                'boolean',
                'button',
                false,
                true,
            );
            await this.setObjectNotExistsAsyncEasy(
                `${device.name}.commands.syncTime`,
                'state',
                'Sync Time',
                false,
                'boolean',
                'button',
                false,
                true,
            );

            await this.subscribeStatesAsync(`${device.name}.commands.*`);
        }
    }

    /**
     * Is called if a subscribed state changes
     *
     * @param id
     * @param state
     */
    async onStateChange(id, state) {
        this.log.debug(`onStateChange: id: ${id} Value ${state.val} ACK ${state.ack}`);

        if (id && state && !state.ack) {
            const id_splits = id.split('.');
            const realid = `${id_splits[2]}.${id_splits[3]}.${id_splits[4]}`;
            const device = await this.GetDeviceByName(id_splits[2]);
            this.log.debug(
                `onStateChange: id: ${id} Device ${device.name} IP ${device.ip} Port ${device.port} Value ${state.val}`,
            );
            if (id.includes('.setSpeed')) {
                const res = await this.sendHttpRequest(
                    `http://${device.ip}:${device.port}/?speed=${state.val}`,
                    device.name,
                );
                if (!res) {
                    return this.log.error(
                        `An error has occured while trying to set Device ${device.name} Speed to ${state.val}`,
                    );
                }
                await this.setState(`${device.name}.states.speed_in`, state.val, true);
                await this.setState(`${device.name}.states.speed_out`, state.val, true);
                await this.setState(realid, state.val, true);
            } else if (id.includes('.powerOn')) {
                const res = await this.sendHttpRequest(`http://${device.ip}:${device.port}/?power=on`);
                if (!res) {
                    return this.log.error(`An error has occured while trying to power on device ${device.name}`);
                }
                await this.setState(`${device.name}.states.systemon`, 1, true);
                await this.setState(realid, false, true);
            } else if (id.includes('.powerOff')) {
                const res = await this.sendHttpRequest(`http://${device.ip}:${device.port}/?power=off`);
                if (!res) {
                    return this.log.error(`An error has occured while trying to power off device ${device.name}`);
                }
                await this.setState(`${device.name}.states.systemon`, 0, true);
                await this.setState(realid, false, true);
            } else if (id.includes('.setAuto')) {
                const res = await this.sendHttpRequest(`http://${device.ip}:${device.port}/?speed=0`);
                if (!res) {
                    return this.log.error(
                        `An error has occured while trying to set automatic mode for device ${device.name}`,
                    );
                }
                await this.setState(`${device.name}.states.speed_in`, 0, true);
                await this.setState(`${device.name}.states.speed_out`, 0, true);
                await this.setState(realid, false, true);
            } else if (id.includes('.buttonPower')) {
                const res = await this.sendHttpRequest(`http://${device.ip}:${device.port}/?button=power`);
                if (!res) {
                    return this.log.error(
                        `An error has occured while trying to send power button for device ${device.name}`,
                    );
                }
                await this.setState(realid, false, true);
            } else if (id.includes('.buttonTimer')) {
                const res = await this.sendHttpRequest(`http://${device.ip}:${device.port}/?button=timer`);
                if (!res) {
                    return this.log.error(
                        `An error has occured while trying to send power button to device ${device.name}`,
                    );
                }
                await this.setState(realid, false, true);
            } else if (id.includes('.syncTime')) {
                const res = await this.sendHttpRequest(`http://${device.ip}:${device.port}/index.html?TimeSync=1`);
                if (!res) {
                    return this.log.error(`An error has occured while trying to sync time for device ${device.name}`);
                }
                await this.setState(realid, false, true);
            }
        }
    }

    /**
     * Creates an object in the object db. Existing objects are overwritten.
     *
     * @param id ID
     * @param type Type
     * @param name The name of this object as a simple string or an object with translations
     * @param def the default value
     * @param common_type Type of this state. See https://github.com/ioBroker/ioBroker/blob/master/doc/SCHEMA.md#state-commonrole for a detailed description
     * @param role role of the state (used in user interfaces to indicate which widget to choose)
     * @param read if this state is readable
     * @param write if this state is writable
     * @param min Minimum (Optional)
     * @param max Maximum (Optional)
     */
    async setObjectNotExistsAsyncEasy(id, type, name, def, common_type, role, read, write, min = -1, max = -1) {
        const object = await this.getObjectAsync(id);
        if (object == null) {
            if (min != -1 && max != -1) {
                await this.setObjectNotExistsAsync(id, {
                    type: type,
                    common: {
                        name: name,
                        def: def,
                        type: common_type,
                        role: role,
                        read: read,
                        write: write,
                        min: min,
                        max: max,
                    },
                });
            } else {
                await this.setObjectNotExistsAsync(id, {
                    type: type,
                    common: { name: name, def: def, type: common_type, role: role, read: read, write: write },
                });
            }
        } else {
            if (id.includes('.data.')) {
                await this.setStateAsync(id, { val: def, ack: true });
            } else if (id.includes('.parameter.')) {
                await this.setStateAsync(id, { val: parseFloat(def), ack: true });
            } else if (id.includes('.states.')) {
                await this.setStateAsync(id, { val: parseFloat(def), ack: true });
            }
        }
    }

    /**
     * Returns all devices in config
     *
     * @returns All Devices in Config
     */
    GetDevices() {
        return this.config.devices;
    }

    /**
     * Get Device Info by Name
     *
     * @param name Device name
     */
    async GetDeviceByName(name) {
        const devices = await this.GetDevices();
        if (devices == null || !devices) {
            return null;
        }
        let device = null;
        for await (const devicen of devices) {
            if (devicen.name == name) {
                device = devicen;
                break;
            }
        }
        return device;
    }

    /**
     *
     * @param url URL to get Data from
     * @param deviceName Device Name
     */
    async GetHttpRequest(url, deviceName) {
        let response = null;
        try {
            response = await NodeFetch(url);
        } catch (error) {
            if (error.code == 'ETIMEDOUT') {
                this.log.error(
                    `An error has occured while trying to get response from device ${deviceName}. The Connection timed out!`,
                );
                return null;
            }
            if (error.code == 'ECONNREFUSED') {
                this.log.error(
                    `An error has occured while trying to get response from device ${deviceName}. The Connection has been refused!`,
                );
                return null;
            }
            this.log.error(`An unexpected error has occred while trying to get response from device ${deviceName}.`);
            return null;
        }

        let data = null;
        try {
            data = await response.json();
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
        if (data == null) {
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
    /**
     * @param [options]
     */
    module.exports = options => new Bayernluft(options);
} else {
    // otherwise start the instance directly
    new Bayernluft();
}
