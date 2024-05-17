![Logo](admin/bayernluft.png)
# ioBroker.bayernluft

[![NPM version](https://img.shields.io/npm/v/iobroker.bayernluft.svg)](https://www.npmjs.com/package/iobroker.bayernluft)
[![Downloads](https://img.shields.io/npm/dm/iobroker.bayernluft.svg)](https://www.npmjs.com/package/iobroker.bayernluft)
![Number of Installations](https://iobroker.live/badges/bayernluft-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/bayernluft-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.bayernluft.png?downloads=true)](https://nodei.co/npm/iobroker.bayernluft/)

**Tests:** ![Test and Release](https://github.com/Marco15453/ioBroker.bayernluft/workflows/Test%20and%20Release/badge.svg)

## BayernLuft Adapter for ioBroker
Connects BayernLuft into IoBroker

## What needs to be done?
To use this adapter, you need to change the export template of the device
**Be sure to follow the steps below**

## How to change the Template?
1. Go to the Interface of your Device
2. Click on the Settings Gear to head to the Settings
3. Scroll Down until you see the Expert Mode
4. Delete the file 'export.txt' (Be sure to backup it before you continue)
5. Create a new file on your Desktop called 'export.txt' (Be sure it is an Text File)
6. Open the file and paste this into it.
```json
{
    "data": {
        "date": "~Date~",
        "time": "~Time~",
        "name": "~DeviceName~",
        "mac": "~MAC~",
        "local_IP": "~LocalIP~",
        "rssi": "~RSSI~",
        "fw_MainController": "~FW_MainController~",
        "fw_WiFi": "~FW_WiFi~"
    },
    "parameter": {
        "temperature_In": "~Temp_In~",
        "temperature_Out": "~Temp_Out~",
        "temperature_Fresh": "~Temp_Fresh~",
        "rel_Humidity_In": "~rel_Humidity_In~",
        "rel_Humidity_Out": "~rel_Humidity_Out~",
        "abs_Humidity_In": "~abs_Humidity_In~",
        "abs_Humidity_Out": "~abs_Humidity_Out~",
        "efficiency": "~Efficiency~",
        "humidity_Transport": "~Humidity_Transport~"
    },
    "states": {
        "speed_In": "~Speed_In~",
        "speed_Out": "~Speed_Out~",
        "antiFreeze": "~Speed_AntiFreeze~",
        "SystemOn": "~_SystemOn~",
        "AntiFreeze": "~_FrostschutzAktiv~",
        "Fixed_Speed": "~_Frozen~",
        "Defrosting": "~_AbtauMode~",
        "Landlord_Mode": "~_VermieterMode~",
        "Cross_Ventilation": "~_QuerlueftungAktiv~",
        "Timer_active": "~_MaxMode~"
    }
}
```
7. Save the file and head back on the Devices Interface and upload the new 'export.txt' file.
8. Your Done

## Credits

This adapter would not have been possible without the great work of @Marco15453 (https://github.com/Marco15453), who create V1.x.x of this adapter.

## Changelog
<!--
	Placeholder for the next version (at the beginning of the line):
-->

### **WORK IN PROGRESS**
* (mcm1957) Adapter has been move to iobroker-community-adapters organization
* (mcm1957) Dependencies have been updated


## License
MIT License

Copyright (c) 2024, iobroker-community-adapters <iobroker-community-adapters@gmx.de>
Copyright (c) 2022 Marco15453 <support@marco15453.xyz>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.