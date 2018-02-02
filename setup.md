---
layout: page
title: Setup
permalink: /doc/setup
---

## Quick setup

Use our [Maven](http://maven.apache.org/) archetype and modify generated project to your liking.

    mvn archetype:generate -B \
        -DarchetypeGroupId=org.pousse-cafe-framework \
        -DarchetypeArtifactId=pousse-cafe-simple-meta-app-archetype \
        -DarchetypeVersion={{ site.latest_release_version }} \
        -DgroupId=test \
        -DartifactId=test \
        -Dversion=1.0.0-SNAPSHOT

Above command creates a folder called `test` containing a Maven project with all required dependencies to build a
Meta-Application.

## Dependencies

Pousse-Café is composed of several Maven modules, allowing developers to include only the ones they need. The modules
are available through [Maven Central Repository](http://search.maven.org), no need to configure alternative repositories.

To create your first Meta-Application, you will need at least to depend on the Core module. Add the following snippet to
the `dependencies` of your POM.

    <dependency>
      <groupId>org.pousse-cafe-framework</groupId>
      <artifactId>pousse-cafe-core</artifactId>
      <version>{{ site.latest_release_version }}</version>
    </dependency>

To be able to test your Meta-Application, a dependency to the Test module is also required. Add the following snippet to
the `dependencies` of your POM.

    <dependency>
      <groupId>org.pousse-cafe-framework</groupId>
      <artifactId>pousse-cafe-test</artifactId>
      <version>{{ site.latest_release_version }}</version>
      <scope>test</scope>
    </dependency>

The Spring integration is provided by:

    <dependency>
      <groupId>org.pousse-cafe-framework</groupId>
      <artifactId>pousse-cafe-spring</artifactId>
      <version>{{ site.latest_release_version }}</version>
    </dependency>

Finally, Spring Data MongoDB integration is provided via:

    <dependency>
      <groupId>org.pousse-cafe-framework</groupId>
      <artifactId>pousse-cafe-spring-mongo</artifactId>
      <version>{{ site.latest_release_version }}</version>
    </dependency>

which rely on `pousse-cafe-spring` so no need to state both in the POM.
