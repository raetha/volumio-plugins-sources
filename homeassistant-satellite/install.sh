#!/bin/bash

echo "Installing Home Assistant Satellite Dependencies"
sudo apt-get update
# Install the required packages via apt-get
sudo apt-get -y install python3-pip python3-venv libatlas3-base
sudo apt-get -y install --no-install-recommends ffmpeg
# Additional required packages currently includeed in Volumio3-OS
#sudo apt-get -y install python3 alsa-utils git

# TODO - Installing Pulse Audio or Pipewire Support - may not work on Volumio3 as is
# sudo apt-get -y install libpulse0

#Set variables
PLUGIN_DIR="$( cd "$(dirname "$0")" ; pwd -P )"
PLUGIN_CATEGORY=$(cat "$PLUGIN_DIR"/package.json | jq -r ".volumio_info.plugin_type")
PACKAGE_NAME=$(cat "$PLUGIN_DIR"/package.json | jq -r ".name")
#PACKAGE_NAME_LOWER=`echo "$PACKAGE_NAME" | tr "[A-Z]" "[a-z]"`
PACKAGE_URL=$(cat "$PLUGIN_DIR"/package.json | jq -r ".repository")
TMPDIR=`mktemp -d`
INSTALL_DIR="/data/plugins/$PLUGIN_CATEGORY/$PACKAGE_NAME"
BASE_DIR="/opt/$PACKAGE_NAME"

exit_cleanup () {
  echo "Exit Status: $R"
  if [ $R -eq 1 ]; then
    echo "Plugin ${name} failed to install!"
    echo "Cleaning up.."
    if [ -d "$INSTALL_DIR" ]; then
      echo "Removing Install directory.."
      rm -Rf "$INSTALL_DIR"
    else
      echo "Install Directory does not exist."
    fi
  fi
  if [ -d "$TMPDIR" ]; then
    echo "Removing tmp directory.."
    rm -Rf "$TMPDIR"
  fi
  echo "plugininstallend"
}
trap exit_cleanup EXIT

# Download and configure
echo "Downloading Home Assistant Satellite"
DL_STATUSCODE=$(git clone "$PACKAGE_URL.git" "$TMPDIR/$PACKAGE_NAME")
R=$?
if [ $R -ne 0 ] | [ $DL_STATUSCODE -ne 200 ]; then
  # manually setting status code to 1 for a failed download (e.g. 404 error).
  R="1"
  echo "Download of Home Assistant Satellite failed!"
  echo "URL: $PACKAGE_URL"
  echo "HTTP Status Code: $DL_STATUSCODE"
  exit 1
fi

echo "Moving Files into plugin directory."
mkdir -p $INSTALL_DIR
mv "$TMPDIR/$PACKAGE_NAME" "$BASE_DIR"
rm -Rf "$TMPDIR"

# Initial setup
echo "Configuring Home Assistant Satellite"
cd $BASE_DIR
script/setup

# Install additional features into venv
.venv/bin/pip3 install --find-links https://synesthesiam.github.io/prebuilt-apps/ .[silerovad]
.venv/bin/pip3 install .[webrtc]
.venv/bin/pip3 install .[wyoming]

# Prepare service file
touch $INSTALL_DIR/$PACKAGE_NAME.service
ln -fs $INSTALL_DIR/$PACKAGE_NAME.service /lib/systemd/system/$PACKAGE_NAME.service

# Change Owner of files to volumio
chown -R volumio:volumio $INSTALL_DIR

#requred to end the plugin install
# echo "plugininstallend" # is called in the exit_cleanup function which is executed by a trap on exit
