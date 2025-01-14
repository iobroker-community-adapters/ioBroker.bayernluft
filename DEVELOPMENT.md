# Ideas dor Future Changes

## Ideas
- Don't use state names from export.txt (they are not really helpful and we could save another http request and the parsing/character-replacing). Instead, the json template could be modified?
- Initial device connection is done by a normal and complete polling: should the first connect just check general connection to the device and then initiate polling?
- the device port in the instance config should be 80 by default. As far as I can see there is no option to change it, so maybe just remove it?

## From the Changelog of the Device-Firmware (german):
siehe https://www.bayernluft.de/de/wlan32_changelist.html

WS32243401
Diese Version ist noch nicht offiziell freigegeben, kann aber über folgenden Befehl installiert werden, wobei die IP-Adresse durch die vom eigenen Gerät zu ersetzen ist:
192.168.178.190/index.html?testversion=WS32243401
Neu hinzugekommen ist die Möglichkeit Datum und Uhrzeit manuell zu stellen. Wichtig dabei ist, dass eine ggf. führende Null mit eingegeben werden muss:
192.168.178.190/index.html?SetDate=13.01.2025
192.168.178.190/index.html?SetTime=08:50

WS32240427
a) Auf Wunsch von Smarthome-Betreibern wurden folgende Smarthome-Befehle programmiert, die jetzt bei ausgeschaltetem Gerät auch die einzelne und unabhängige Ansteuerung jedes einzelnen Lüftermotors erlauben.
Die neuen Smarthome-Befehle lauten:
?speedOut=xx (xx: 0-10)
?speedIn=xx (xx: 0-10)
?speedFrM=xx (xx: 0-50 in 5er-Schritten)

WS32234901
Sowohl die Anzeige im Live-Schema, als auch die Export-Funktion für Smarthome-Systeme wurde auf vielfachen Wunsch um die Möglichkeit erweitert, als Dezimaltrennzeichen zwischen Punkt und Komma wählen zu können. Ohne weiteren Befehl werden die Werte weiterhin mit einem Komma ausgegeben. Möchte man als Trennzeichen einen Punkt, so hängt man den Befehl hinter den Aufruf.
Beispiel: http://192.168.178.190/index.html?decimal=point
oder
http://192.168.178.190/index.html?export=1&decimal=point

WS32234601
Die Export-Funktion für Smarthome-Systeme wurde flexibel erweitert und im Live-Onlineschema aktualisieren sich die Werte jetzt jede Sekunde automatisch, ohne die komplette Seite neu laden zu müssen.
Die Funktion ?export=1 liefert dabei weiterhin die export.txt aus. Die Funktion ?export=xyz liefert die Vorlage export_xyz.txt aus usw. Somit kann man mehrere Vorlagen für unterschiedliche Anwendungen erstellen und nutzen.

WS32232301
c:) Der Rauchgas-Thermostat-Modus kann jetzt aktiviert werden
Einschalten: ?SetRGT=1
Ausschalten: ?SetRGT=0
Ist der Rauchgas-Thermostat-Modus aktiviert, dann läuft das Gerät nur dann, wenn der Kontakt zwischen Pin 5+3 z.B. durch ein Relais geschlossen ist. Dieser Modus kann auch für Unterdruckwächter oder eine andere externe Schaltmöglichkeit genutzt werden.
