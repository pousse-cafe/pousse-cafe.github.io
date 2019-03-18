---
layout: page
title: Setup
permalink: /doc/setup/
---

## Quick setup

Use our [Maven](http://maven.apache.org/) archetype and modify generated project to your liking.

    mvn archetype:generate -B \
        -DarchetypeGroupId=org.pousse-cafe-framework \
        -DarchetypeArtifactId=pousse-cafe-sample-bounded-context-archetype \
        -DarchetypeVersion={{ site.latest_release_version }} \
        -DgroupId=test \
        -DartifactId=test \
        -Dversion=1.0.0-SNAPSHOT

Above command creates a folder called `test` containing a Maven project with all required dependencies to build your
first Bounded Context.

## Dependencies

Pousse-Café is composed of several Maven modules, allowing developers to include only the ones they need. The modules
are available through [Maven Central Repository](http://search.maven.org).

To create your first Bounded Context, you will need at least to depend on the Core module. Add the following snippet to
the `dependencies` of your POM.

    <dependency>
      <groupId>org.pousse-cafe-framework</groupId>
      <artifactId>pousse-cafe-core</artifactId>
      <version>{{ site.latest_release_version }}</version>
    </dependency>

To be able to test your Bounded Context, a dependency to the Test module is also recommanded. Add the following snippet to
the `dependencies` of your POM.

    <dependency>
      <groupId>org.pousse-cafe-framework</groupId>
      <artifactId>pousse-cafe-test</artifactId>
      <version>{{ site.latest_release_version }}</version>
      <scope>test</scope>
    </dependency>
