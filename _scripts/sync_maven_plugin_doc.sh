#!/bin/bash

PLUGIN_SRC_PATH="../pousse-cafe-maven-plugin"
PLUGIN_DOC_PATH="pousse-cafe-maven-plugin"

if [ ! -d $PLUGIN_DOC_PATH ]; then
    echo "Destination directory does not exist"
    exit 1
fi

rm -rf $PLUGIN_DOC_PATH/*
( cd $PLUGIN_SRC_PATH ; mvn clean site )
cp -r $PLUGIN_SRC_PATH/target/site/* $PLUGIN_DOC_PATH
find $PLUGIN_DOC_PATH -name *.xcf -delete
