#!/bin/bash

PLUGIN_DIR="$( cd "$(dirname "$0")" ; pwd -P )"
PLUGIN_CATEGORY=$(cat "$PLUGIN_DIR"/package.json | jq -r ".volumio_info.plugin_type")
PACKAGE_NAME=$(cat "$PLUGIN_DIR"/package.json | jq -r ".name")

if [ -f "/lib/systemd/system/$PACKAGE_NAME.service" ]; then
	echo "Removing Home Assistant Satellite service..."
	systemctl stop homeassistant-satellite
	rm "/lib/systemd/system/$PACKAGE_NAME.service"
	systemctl daemon-reload
fi

echo "Cleaning up files..."
if [ -d "/opt/$PACKAGE_NAME" ]; then
	rm -Rf "/opt/$PACKAGE_NAME"
fi

# Uninstall dependendencies
sudo apt-get -y purge python3-pip python3-venv libatlas3-base ffmpeg
sudo apt-get -y autoclean
sudo apt-get -y autoremove --purge

echo "Done"
echo "pluginuninstallend"
