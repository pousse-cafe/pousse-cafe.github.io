---
layout: page
title: Setup
permalink: /doc/setup/
---

## Quick setup

Use our [Maven](http://maven.apache.org/) archetype and modify generated project to your liking (do not forget to replace archetype version with the latest
<img alt="latest version" src="https://maven-badges.herokuapp.com/maven-central/org.pousse-cafe-framework/pousse-cafe-sample-app-archetype/badge.svg">):

    mvn archetype:generate -B -DarchetypeGroupId=org.pousse-cafe-framework -DarchetypeArtifactId=pousse-cafe-sample-app-archetype -DarchetypeVersion=$ARCHETYPE_VERSION -DgroupId=test -DartifactId=test -Dversion=0.1.0-SNAPSHOT

Above command creates a folder called `test` containing a Maven project with all required dependencies to build your
first Pousse-Café based application.

## Dependencies

Pousse-Café is composed of several Maven modules, allowing developers to include only the ones they need. The modules
are available through [Maven Central Repository](https://search.maven.org/search?q=g:org.pousse-cafe-framework).

To create your first aggregates, you will need at least to depend on the Core module. Add the following snippet to
the `dependencies` of your POM.

    <dependency>
      <groupId>org.pousse-cafe-framework</groupId>
      <artifactId>pousse-cafe-core</artifactId>
      <version>${pousse-cafe.version}</version>
    </dependency>

To be able to test your code, a dependency to the Test module is also recommended. Add the following snippet to
the `dependencies` of your POM.

    <dependency>
      <groupId>org.pousse-cafe-framework</groupId>
      <artifactId>pousse-cafe-test</artifactId>
      <version>${pousse-cafe.version}</version>
      <scope>test</scope>
    </dependency>

See Pousse-Café's [example project](https://github.com/pousse-cafe/pousse-cafe-shop-app) for more details.
