#!/bin/bash

(
cd ../pousse-cafe-shop-app/ ;
mvn pousse-cafe:generate-doc -DbasePackage=poussecafe.shop -DdomainName=Shop -Dversion=Latest
)
cp -rf ../pousse-cafe-shop-app/target/ddd-doc/* shop-doc/
mv shop-doc/pousse-cafe-shop-app-*.pdf shop-doc/pousse-cafe-shop-app-Latest.pdf
