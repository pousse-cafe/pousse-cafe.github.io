#!/bin/bash

PLUGIN_DOC_PATH="pousse-cafe-maven-plugin"

if [ ! -d $PLUGIN_DOC_PATH ]; then
    echo "Destination directory does not exist"
    exit 1
fi

rm -rf $PLUGIN_DOC_PATH/*
( cd ../pousse-cafe/pousse-cafe-maven-plugin ; mvn clean site )
cp -r ../pousse-cafe/pousse-cafe-maven-plugin/target/site/* $PLUGIN_DOC_PATH
find pousse-cafe-maven-plugin -name *.xcf -delete
