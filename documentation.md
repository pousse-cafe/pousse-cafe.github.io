---
layout: page
title: Reference Guide
permalink: /doc/reference-guide/
---

## Content

- [Introduction](#introduction)
- [Domain-Driven Design in a nutshell](#domain-driven-design-in-a-nutshell)
- [The purpose of Pousse-Café](#the-purpose-of-pousse-caf)
- [Quick Summary](#quick-summary)
- [Storage and Messaging](#storage-and-messaging)
- [Implement Aggregates](#implement-aggregates)
- [Implement Services](#implement-services)
- [Handle Messages](#handle-messages)
- [Run your Model](#run-your-model)
- [Test your Model](#test-your-model)
- [Custom Message Listeners](#custom-message-listeners)
- [Message Listeners execution order](#message-listeners-execution-order)
- [Collision Handling](#collision-handling)
- [Spring Integration](#spring-integration)
- [Alternative Storage](#alternative-storage)
- [Generating DDD documentation](#generating-ddd-documentation)

## Introduction

The main purpose of Pousse-Café is to provide tools making the development of high quality and production-ready [Domain-Driven Design
(DDD)](https://en.wikipedia.org/wiki/Domain-driven_design)-based applications easier.

While DDD is an effective 
tool for designing applications with complex business needs, its actual implementation generally brings a set of
technical issues/questions that need to be addressed. Those questions and issues require a good knowledge
of DDD and some experience to be properly handled.

The next section quickly summarizes DDD, focusing on the elements that Pousse-Café covers,
in order to introduce the elements required to describe precisely Pousse-Café's purpose. If you already know
enough on DDD, feel free to skip it.

## Domain-Driven Design in a nutshell

Domain-Driven Design (DDD) defines (but is not limited to) a set of tools targeting better communication, deeper
description of concepts, cleaner
code and scalable software.

The *Domain Model* is the model of the reality an organization is working in.
It is described using the terms defined by a common language (the *Ubiquitous Language*) between domain
experts and developers.

When building a software,
you actually implement the Domain Model. When applying DDD, domain experts and developers work closely to
build the Domain Model together. The Domain Model and the code evolve simultaneously. DDD defines several design elements:

- An *Entity* is a component that has an identity (i.e. it can be referenced) and a life-cycle (it is created, altered and maybe disposed). For instance, a product sold in an e-shop is initially created, its description updated, out for sell, sold-out and then finally removed.
- A *Value Object* (VO) is a component without identity which is fully described by its attributes and is immutable.
For instance, the price of a product.
- A *Service* is a stateless component that represents an operation that does not naturally belong to an Entity or a VO.
- An *Aggregate* is a cluster of associated Entities that is treated as a unit, defines strong consistency rules on state
changes and has a *Root Entity* (also called *Aggregate Root*; the only Entity of the cluster that can be referenced from outside of the cluster).
- *Domain Events* are events emitted when an Aggregate is updated. They can then trigger the update of other Aggregates,
allowing the definition of invariants spanning several Aggregates. No assumption should be made on when a Domain Event
is actually handled, this means that invariants spanning several Aggregates are not always true at all times (by
opposition to Aggregate consistency rules which must always be true).
- *Eventual Consistency* is the fact that, after some time, all invariants, including the ones spanning several Aggregates,
are true.
- A *Factory* is a Service that creates Aggregates in an initially consistent state.
- A *Repository* is a Service that retrieves, stores, updated and removes Aggregates from a given storage.
- A *Module* defines a boundary inside of which there is a bijection between domain components and their name.

## The purpose of Pousse-Café

As mentioned in the introduction, implementing DDD brings a set of technical questions and issues. Below the ones
that Pousse-Café addresses.

- When writing Domain logic, the code must be as exempt as possible of technical elements (in particular, storage and
messaging related elements). It is easy to end up in a
situation where storage-related issues are handled by code that is part of the implementation of a Domain component
(Aggregate, Service, etc). Pousse-Café defines a way of implementing Entities preventing this (see this [section](#implement-aggregates)). In particular:
  - Domain logic is decoupled from data implementation;
  - Data implementation relies on Attributes, reducing the amount of code to write in domain logic.
- Domain Events should be handled by Domain logic but, at the same time, Domain logic cannot be crippled with technical
  details like opening a DB transaction and committing it. Pousse-Café provides tools enabling this in the 
  cleanest possible way.
- Evaluating that a given Domain Model implementation actually fits the Domain Model involves domain experts.
  A GUI or test cases do not always show the full complexity of a given Domain Model.
  At the same time, it is, most of the time, not a viable option to have domain experts directly review the code.
  An approach
  enabled by Pousse-Café is to generate a domain-expert-readable documentation (i.e. a PDF file written in
  natural language) from the code which can be reviewed by domain experts.

Pousse-Café relies on the definition of a model which is composed of the Domain components as well as
Domain Processes. The goal is to define the Domain logic in a way that is as independent as possible of underlying
technologies and then instantiate it in an actual application by plugging in the required adapters.

## Quick Summary

<img src="/img/big_picture.svg">

- A Pousse-Café model (i.e. a set of [Aggregates](#implement-aggregates) and [Services](#implement-services)) is
  executed by a [Runtime](#run-your-model)
- [Commands](#handle-messages) are submitted to the Runtime
- Commands are handled by the Aggregates using [Message Listeners](#handle-messages)
- Aggregates emit [Domain Events](#handle-messages)
- The set of Message Listeners executed following the submission of a Command defines a [Domain Process](#domain-processes)
- Aggregates may be grouped in [Modules](#module)
- Domain Events may cross Modules borders

## Storage and Messaging

Pousse-Café works with "plugable" Storage and Messaging systems:

- A Storage tells how to persist [Aggregate](#implement-aggregates) data.
- A Messaging tells how [Commands and Domain Events](#handle-messages) must be marshaled and transmitted.

A Storage is linked to each defined Aggregate. A Messaging is linked to each defined Command and Domain Event.
Different Aggregates may use different Storage systems. This is also true for Commands and Domain Events.
This feature is useful when migrating from one Storage/Messaging system to another for instance.

A Storage system may require transaction management. Pousse-Café does this automatically so that the developer should
almost never have to handle it manually (though [there are exceptions](#in-an-explicit-domain-process)).

Pousse-Café handles Storage and Messaging as follows:

1. In reaction to a Command or a Domain Event, an Aggregate is [updated](#in-an-aggregate-root),
[created](#in-a-factory) or [deleted](#in-a-repository).
2. The change is persisted using Storage and, potentially, implying a transaction.
3. If persistence is successful (i.e. transaction was successfully committed if applicable), then emitted Domain Events
are sent using Messaging system.

Note that Commands are not sent using Messaging. They are inserted directly in an in-memory queue. Therefore,
Commands do not need to be "serializable".

## Implement Aggregates

The central element in Pousse-Café is the Aggregate and its related Services (i.e. the Factory and the Repository).

### Aggregate Root

The Aggregate Root is implemented by a class extending `AggregateRoot<K, D>` where

- `K` is the type representing the identifier that
can be used to reference the Aggregate and
- `D` is the type representing the data related to the Aggregate.

`D` must implement the interface `EntityAttributes<K>` which defines an attribute for Aggregate's ID.

It is recommended to defined ``D`` as a static inner-class of the class defining the Aggregate Root. Indeed, Domain
logic and data model are strongly linked.

Pousse-Café decouples Domain logic and data implementation. This way, an Entity's implementation
is not crippled by technical details about how data have to be defined or annotated to fit the underlying storage technology.

Below example describes a Product Aggregate giving
the possibility to place an Order i.e. remove a number of units from the number of available units. If there are enough
units available, the `OrderPlaced` Event is emitted. Otherwise, the `OrderRejected` Event is emitted.

    @Aggregate(
        factory = ProductFactory.class,
        repository = ProductRepository.class
    )
    public class Product extends AggregateRoot<ProductId, Product.Attributes> {
        ...
    
        public void placeOrder(OrderDescription description) {
            int unitsAvailable = attributes().availableUnits().value();
            if (description.units > unitsAvailable) {
                OrderRejected event = newDomainEvent(OrderRejected.class);
                event.productId().value(attributes().identifier().value());
                event.orderId().value(description.orderId);
                emitDomainEvent(event);
            } else {
                attributes().availableUnits().value(unitsAvailable - description.units);
    
                OrderPlaced event = newDomainEvent(OrderPlaced.class);
                event.productId().value(attributes().id().value());
                event.orderId().value(description.orderId);
                emitDomainEvent(event);
            }
        }
    
        public static interface Attributes extends EntityAttributes<ProductId> {
            ...
    
            Attribute<Integer> availableUnits();
        }
    }

The ``@Aggregate`` annotation explicitly links the Root to the Aggregate's Factory and Repository.
It is required by [Pousse-Café's Runtime](#run-your-model) in order to detect it.

The ``Product.Attributes`` interface defines the data model of an Entity (and in particular, the Aggregate Root).
Each attribute is defined by a method
returning an instance of ``Attribute<V>`` where ``V`` is the type of the attribute.

The ``Attribute`` interface is defined as follows:

    public interface Attribute<V> {
      
      V value();
    
      void value(V value);
    
      ...
    }

The ``value`` methods allow to read and write the attribute's value. The interface also defines additional helper
methods which are not shown here.

Defining attributes with methods returning an ``Attribute`` instance instead of explicitly defining a getter and a
setter has the following advantages:

- There is a univocal relation between a method and an attribute of the data model,
- The definition of the data model is cleaner (less lines of code, no names including useless get/set),
- Simple consistency constraints can be enforced implicitly (no null value, ...).

Below example illustrates an implementation of ``Product.Attributes`` interface.

    @SuppressWarnings("serial")
    public class ProductData implements Product.Attributes, Serializable {
    
        @Override
        public Attribute<ProductId> id() {
            return AttributeBuilder.stringId(ProductId.class)
                .read(() -> productId)
                .write(value -> productId = value)
                .build();
        }
    
        private String productId;
    
        @Override
        public Attribute<Integer> availableUnits() {
            return AttributeBuilder.single(Integer.class)
                .read(() -> availableUnits)
                .write(value -> availableUnits = value)
                .build();
        }
    
        private int availableUnits;
        
        ...
    }

This implementation is serializable and is therefore suitable for Pousse-Café's internal memory-based storage
(``InternalStorage``).

Pousse-Café's internal storage's purpose is testing, it should not be used by production code.

Domain Events are defined by interfaces extending the `DomainEvent` interface. The following example shows 
the definition of the `OrderPlaced` Event.

    public interface OrderPlaced extends DomainEvent {
    
        Attribute<ProductId> productId();
    
        Attribute<OrderId> orderId();
    }

The data model of Domain Events is also defined using attributes. Decoupling
Domain Event's data model from the actual implementation allows to plug different implementations for different
messaging technologies without impacting domain logic.

Below example illustrates an implementation of ``OrderPlaced`` interface:

    @MessageImplementation(message = OrderPlaced.class)
    @SuppressWarnings("serial")
    public class OrderPlacedData implements Serializable, OrderPlaced {
    
        @Override
        public Attribute<ProductId> productId() {
            return AttributeBuilder.stringId(ProductId.class)
                .read(() -> productId)
                .write(value -> productId = value)
                .build();
        }
    
        private String productId;
    
        @Override
        public Attribute<OrderDescription> description() {
            return AttributeBuilder.simple(OrderDescription.class)
                .usingAutoAdapter(OrderDescriptionData.class)
                .read(() -> description)
                .write(value -> description = value)
                .build();
        }
    
        private OrderDescriptionData description;
    }

``@MessageImplementation`` annotation links the data implementation to a given event. It is used
[when instantiating a Bundle](#run-your-model). Above implementation is serializable which makes
it suitable for Pousse-Café's internal messaging (``InternalMessaging``). This messaging's purpose is testing, it should not be used by production code.


Aggregate Root's ``newDomainEvent`` method returns a new instance of Domain Event implementation.

Aggregate Root's ``emitDomainEvent`` method queues the Domain Event for emission after the Aggregate is successfully persisted.

### Aggregate life-cycle hooks

An Aggregate is modified by 3 operation types:

- Creation
- Update
- Deletion

An Aggregate Root may react to those operations by updating its attributes or emitting Domain Events. In order to do so,
the following methods may be overridden:

- `onAdd`
- `onUpdate`
- `onDelete`

Below example illustrates the emission of a Domain Event upon creation of a new `Product` aggregate:

    @Aggregate(
        factory = ProductFactory.class,
        repository = ProductRepository.class
    )
    public class Product extends AggregateRoot<ProductId, Product.Attributes> {

        @Override
        public void onAdd() {
            ProductCreated event = newDomainEvent(ProductCreated.class);
            event.productId().valueOf(attributes().identifier());
            emitDomainEvent(event);
        }
        
        ...
    }

### Factory

In order to create Aggregates, a Factory is needed. A Factory extends the `Factory<K, A, D>` class where `K` is the type of the Aggregate's ID, `A` is the Aggregate's type and `D` the type of Aggregate's data.

The following example shows a
Factory for the Product Aggregate. It allows the creation of a Product with initially no available units given its ID.

    public class ProductFactory extends Factory<ProductId, Product, Product.Data> {
    
        public Product buildProductWithNoStock(ProductId productId) {
            Product product = newAggregateWithId(productId);
            product.attributes().availableUnits().value(0);
            ...
            return product;
        }
    }

### Repository

Finally, Aggregates need to be saved, updated or removed from storage. That's the purpose of the Repository which is
implemented by extending the `Repository<A, K, D>` class where

- `A` is the Aggregate's type,
- `K` is the type of the Aggregate's ID and
- `D` the type of Aggregate's attributes.

Repository's role is to

- wrap the data extracted from storage with Aggregate Roots when reading,
- unwrap the data to store into storage from Aggregate Roots when writing.

In order to do that, a Repository uses an instance of interface ``EntityDataAccess<K, D>`` where

- `K` is the type of the Aggregate's ID and
- `D` the type of Aggregate's attributes.

The actual implementation of ``EntityDataAccess<K, D>`` is dependent on the storage and has to be defined
when [configuring the Bundle](#run-your-model).

The Repository class defines the following default operations:

    A find(K id);
    A get(K id);
    void add(A aggregate);
    void update(A aggregate);
    void delete(K id);

where

- `find` returns an Aggregate of null if none was found,
- `get` returns an Aggregate or throws an exception if the Aggregate was not found,
- `add` allows to add a new Aggregate,
- `update` updates an existing aggregate and
- `delete` removes an Aggregate from storage if it was present.

The following example shows a Repository for the Product Aggregate.

    public class ProductRepository extends Repository<Product, ProductId, Product.Attributes> {
    
        public List<Product> findByAvailableUnits(int availableUnits) {
            return wrap(dataAccess().findByAvailableUnits(availableUnits));
        }
    
        @Override
        public ProductDataAccess<Product.Attributes> dataAccess() {
            return (ProductDataAccess<Product.Attributes>) super.dataAccess();
        }
    }

In above example, the additional query method ``findByAvailableUnits`` is defined. When additional query methods
are expected, a specific data access interface can be defined i.e. an interface extending
``EntityDataAccess``:

    public interface ProductDataAccess<D extends EntityAttributes> extends EntityDataAccess<ProductId, D> {
    
        List<D> findByAvailableUnits(int availableUnits);
    }

The data access implementation defined for the Repository must implement the interface. This implementation is
an adapter for storage access.

Below an example of implementation:

    @DataAccessImplementation(
        aggregateRoot = Product.class,
        dataImplementation = ProductData.class,
        storageName = InternalStorage.NAME
    )
    public class ProductDataAccess extends InternalDataAccess<ProductId, ProductData> implements ProductDataAccess<ProductData> {
    
        public List<ProductData> findByAvailableUnits(int availableUnits) {
            return findAll().stream()
                .filter(data -> data.availableUnits().value() == availableUnits)
                .collect(toList());
        }
    }

``@DataAccessImplementation`` annotation links attributes and data access implementations with ``Product``
aggregate. ``storageName`` attribute is used when [instantiating a Pousse-Café Runtime](#run-your-model).
Implementations not matching the chosen storage are ignored.

### Quick Creation of Aggregates

The addition of a single new Aggregate to a Model requires the writing of several classes (at least the Aggregate Root,
the Factory, the Repository and the Data Access). In order to accelerate this
process, Pousse-Café's [Maven plugin](/pousse-cafe-maven-plugin/plugin-info.html) provides the `add-aggregate` goal
which creates all required classes as well as adapters for an [alternative storage](#alternative-storage) if needed.

The new Aggregate is initially created without any attribute but the (required) identifier attribute.
See [the documentation of add-aggregate](/pousse-cafe-maven-plugin/add-aggregate-mojo.html) for more details.

## Implement Services

A Service is defined by a Java class extending class ``Service`` with only the default constructor or an explicit constructor taking no argument.

A Service might depend on other Domain Services. Pousse-Café
provides a minimal dependency injection feature for the injection of Domain Services (including Repositories and Factories).

Below example illustrates the definition of a service:

    public class Service1 implements Service {
    
        public Object produceSomethingUsingService2(Object input) {
            // Use service2
        }
    
        private Service2 service2;
    }

When instantiating `Service1`, Pousse-Café will inject the instance of `Service2` at runtime (`Service2` being a
Service as well).

In some cases, a Service may be abstract because technical details need to be hidden in a specific implementation.
The `@ServiceImplementation` annotation can then be used to annotate the actual implementation and link it to
the abstract service using attribute `service`.


## Handle Messages

There are 2 types of messages in Pousse-Café: Domain Events and Commands. In DDD, one of the purposes of Domain Events
is eventual consistency. Commands represent inputs from users or external systems.

Messages may directly be handled by Domain components i.e. Aggregate Roots, Factories or Repositories.

The ``@MessageListener`` annotation is used to annotate a method that should handle a Domain Event.

### In a Factory

Factory message listeners are used to create Aggregates when handling a Domain Event.

Below example illustrates listeners in a Factory:

    public class MyAggregateFactory extends Factory<...> {
    
        @MessageListener
        public MyAggregate createMyAggregate(Event1 event) {
            ...
        }
    
        @MessageListener
        public Optional<MyAggregate> optionallyCreateMyAggregate(Event2 event) {
            ...
        }
    
        @MessageListener
        public List<MyAggregate> createMyAggregates(Event3 event) {
            ...
        }
    }

``createMyAggregate`` creates an Aggregate each time an event ``Event1`` is consumed.

``optionallyCreateMyAggregate`` creates conditionally an Aggregate when an event ``Event2`` is consumed. When
``Optional.empty()`` is returned, no Aggregate is created.

``createMyAggregates`` creates zero, one or several Aggregates each time an event ``Event3`` is consumed.

When new Aggregates are created, Pousse-Café automatically starts a transaction and commits it if the storage requires
it when persisting the newly created Aggregates. The creation itself i.e. the execution of the message listener
happens outside of the transaction (actually, before it).

Note that there cannot be several listeners per Factory consuming the same message.

### In an Aggregate Root

Aggregate Root message listeners are used to update Aggregates when handling a Domain Event.

Below example illustrates a listener in an Aggregate Root:

    public class MyAggregate extends AggregateRoot<MyAggregateId, MyAggregate.Attributes> {
    
        @MessageListener(runner = UpdateAggregateRunner.class)
        public void updateAggregate(Event2 event) {
            ...
        }
    
        ...
    }

``updateAggregate`` updates the Aggregate in function of consumed ``Event1``. Pousse-Café automatically starts a transaction and commits it if the storage requires it. The message listener is executed inside of the transaction.

The identity of the Aggregates to update needs to be extracted from the event. Therefore, message listeners defined in
Aggregate Roots require a ``AggregateMessageListenerRunner<M, K, A>`` where

- ``M`` is the class of the consumed event,
- ``K`` is the class of Aggregate's identifier,
- ``A`` is the Aggregate Root's class.

A ``AggregateMessageListenerRunner`` is defined as follows:

    public interface AggregateMessageListenerRunner<M, K, A> {
    
        TargetAggregates<K> targetAggregates(M message);
    
        Object context(M message, A aggregate);
    }

``targetAggregates`` defines the IDs of the Aggregates to update given an event. It also allows to define the
IDs of the Aggregates whose creation is expected because they cannot be updated (see section about
[collision handling](#collision-handling)).

``context`` returns the data required to execute the update i.e. information coming potentially from other
Aggregates or external configuration. The use of an update context is not recommended but may be required in some
cases.

Below example illustrates the runner for the listener in above example:

    public class UpdateAggregateRunner extends NoContextByDefaultRunner<Event2, MyAggregateId , MyAggregate> {
    
        public TargetAggregates<MyAggregateId> targetAggregates(Event2 message) {
            ...
        }
    }

``NoContextByDefaultRunner`` extends ``AggregateMessageListenerRunner`` and simply implies an
empty update context.

The Aggregates updated by the consumption of a given event ``Event1`` are identified by the identifiers returned by ``targetAggregatesIds``.

Note that there cannot be several listeners per Aggregate consuming the same message.

In order to accelerate the writing of runners, helpers exist for common situations:

- `AlwaysUpdateRunner`: always update (target aggregates must exist)
- `AlwaysUpdateOneRunner`: always update the target aggregate (target aggregate must exist)
- `UpdateOrCreateRunner`: update the target aggregates or create them if they do not exist (a factory listener must
handle this)
- `UpdateOrCreateOneRunner`: update the target aggregate or create it if it does not exist (a factory listener must
handle this)

### In a Repository

Repository message listeners are used to remove Aggregates when handling a Domain Event.

Below example illustrates a listener in a Repository:

    public class MyAggregateRepository extends Repository<...> {
    
        @MessageListener
        public void deleteAggregate(Event3 event) {
            ...
        }
    }

Note that there cannot be several listeners per Repository consuming the same message.

### In an Explicit Domain Process

Sometimes, defining message listeners at Factory, Aggregate Root and Repository level is not enough and does not allow
to define more complex handling patterns. This is the purpose of *Explicit Domain Processes*.

An Explicit Domain Process is a non-Domain service which defines listeners that consume messages.
It is defined by a class extending ``DomainProcess``.
An Explicit  Domain Process routes Domain Events or Commands to an actual Aggregate Root, Factory or Repository,
potentially by first applying any custom processing.

Below example shows a very simple example of Explicit Domain Process.

    public class MyDomainProcess extends DomainProcess {
    
        @MessageListener
        public void doSomething(Event4 event) {
            runInTransaction(MyAggregate.class, () -> {
                MyAggregate aggregate = repository.get(event.id().value());
                aggregate.handle(event);
                repository.update(aggregate);
            });
        }
    
        private MyAggregateRepository repository;
    }

The `runInTransaction` method runs the provided `Runnable` in the context of a transaction. What this actually
means depends on the storage technology used for target Aggregate.

Note that above example is equivalent to defining the message listener in `MyAggregate` class and defining a runner
than returns a single ID equal to ``event.id().value()``.

In order to keep the code base as small and clean as possible, it is recommended to use Domain Processes only when
required. In other words, put as many message listeners in Factories, Aggregate Roots and Repositories as possible.
Explicit Domain Processes are kept for the very rare cases where this approach is not possible.

### Enrich Listeners Description

A message listener may be annotation with `ProducesEvent` annotation. This annotation tells which type of
Domain Event is emitted by the message listener upon execution and if the emission is optional or not.
Putting this annotation on the listener enables a check by the Runtime that expected events are indeed emitted.
If it is not the case, the execution of the listener fails and an exception is thrown, allowing to detect early the
issue.

This feature is particularly interesting when [testing the model](#test-your-model) but is also used to [generate
model's documentation](#generating-ddd-documentation).

## Run your model

The definitions and implementations of Aggregates and Services of a given Domain Model are grouped in a ``Bundle``.

One or several Bundles may be instantiated in a Pousse-Café ``Runtime``. Upon creation, the 
Runtime instantiates all required services and injects them when necessary. It also gives access to 
Aggregates via their Repository and Factory.

The simplest way to create a Bundle is to use a ``BundleConfigurer``.

Below example illustrates the creation of a BundleConfigurer by automatically loading all Domain components and 
implementations available in a given package and its sub-packages:

    public class MyModel {
    
        private MyModel() {
    
        }
    
        public static BundleConfigurer configure() {
            return new BundleConfigurer.Builder()
                    .moduleBasePackage("poussecafe.myboundedcontext")
                    .build();
        }
    }

The BundleConfigurer uses the following annotations to discover the Domain components to load:

- ``@Aggregate``
- ``@MessageImplementation``
- ``@DataAccessImplementation``
- ``@ServiceImplementation``
- ``@MessageListener``

In addition, sub-classes of the following interfaces/classes are automatically loaded as well:

- ``Service``
- ``DomainProcess``

The BundleConfigurer is used to instantiate a Bundle and provide it to a Runtime which may, finally, be 
started:

    Bundle bundle = MyModel.configure()
        .defineAndImplementDefault()
        .build();
    Runtime runtime = new Runtime.Builder()
        .withBundle(bundle)
        .build();
    runtime.start();

``defineAndImplementDefault`` method returns a Bundle builder that will use internal storage and messaging.

A call to ``Runtime``'s ``start`` method actually starts the consumption of emitted Domain Events by message
listeners. The call to `start` is non blocking.

After that, commands may be submitted to the Runtime using `submitCommand` and Aggregates retrieved using their 
Repository.

Repositories are automatically injected by the Runtime in any registered service. For external services (i.e. non-domain
services), Repositories may be retrieved from ``Runtime``'s ``Environment`` using the following methods:

- ``runtime.environment().domainProcess(domainProcessClass)`` where ``domainProcessClass`` is the class of the Domain Process to retrieve.

A [Spring integration](#spring-integration) exists enabling direct injection of Domain component as regular beans.

## Test your model

Pousse-Café provides tools allowing to easily test your model with no heavy storage setup required.
Actually, you might write your whole Domain logic even before deciding what kind of
storage you would be using. More importantly, it means that you can focus your tests on the Domain.

For testing, it is suggested to use the default in-memory storage implementation provided by Pousse-Café.
When actually integrating your Model in a real application, you could
then just choose another implementation [when building the Runtime](#run-your-model).

`PousseCafeTest` class can be extended to write (JUnit) tests involving different Bundles.
What this class does is essentially instantiate a Runtime and provide helpers to access its components.

Below example illustrates a test verifying that the handling of "Create Product" command actually implies the new
product to be available from the Repository.

    public class ProductManagementTest extends PousseCafeTest {
    
        @Override
        protected Runtime.Builder runtimeBuilder() {
            return super.runtimeBuilder()
                    .withBundle(Shop.configure().defineAndImplementDefault().build());
        }
    
        @Test
        public void productCanBeCreated() {
            ProductId productId = new ProductId("product-id");
            submitCommand(new CreateProduct(productId));
            assertTrue(getOptional(Product.class, productId).isPresent());
        }
    }

Overriding the `runtimeBuilder` method enables the configuration of test Runtime.

``submitCommand`` directly submits the given command into the Runtime for handling.

`getOptional` method is a shortcut that retrieves an Aggregate from its Repository.
`getOptional` also waits that all
messages published when executing the command are actually consumed. This ensures that there will be no race
condition between the asynchronous handling of Domain Events and the fact that the Aggregate being fetched might be
created as a consequence of the consumption of one of those messages.

### Initial state

Generally, when testing the handling of a Command or Domain Event, you need an initial data set to be available (i.e.
an initial state for a collection of aggregates).

You may do this programmatically (by submitting a sequence of Commands and/or Domain Events). However, this approach
may produce code which is hard to maintain: each time the process leading to the initial state you are trying to 
produce changes, you may have to modify your test code, even if the result remains unchanged.

Another possibility is to directly load data from a structured file. The file contains the data for all aggregates
that make the expected initial state. `PousseCafeTest` class provides a method called `loadDataFile`. Calling
this method actually reads a JSON file and adds aggregates data into the test storage. `loadDataFile` takes a String 
argument which is a resource name such as consumed by `Class.getResource`. This enables to point to a file available
on the class path (e.g. a file located in `src/test/resources` when using Maven).

The file loaded by `loadDataFile` must have the following structure:

    {
        "package.to.AnAggregateRoot": [
            {
                ...
            },
            ...
        ],
        ...
    }

The root element is an object, each field of the object being identified by the fully qualified class name of an
Aggregate Root. The value of the fields is an array of objects, each object representing the data of linked Aggregate.
The fields of the data objects depend on the implementation of an Aggregate's data. For example, if you data 
implementation class looks like this:

    @SuppressWarnings("serial")
    public class ProductData implements Product.Attributes, Serializable {
    
        @Override
        public Attribute<ProductId> id() {
            return AttributeBuilder.stringId(ProductId.class)
                .read(() -> productId)
                .write(value -> productId = value)
                .build();
        }
    
        private String productId;
    
        @Override
        public Attribute<Integer> availableUnits() {
            return AttributeBuilder.single(Integer.class)
                .read(() -> availableUnits)
                .write(value -> availableUnits = value)
                .build();
        }
    
        private int availableUnits;
        
        ...
    }

then you JSON data will look like that:

    {
        "productId": "...",
        "availableUnits": ...,
        ...
    }

### Testing a Single Entity

Sometimes, one wants to only test a single method of an Entity (i.e. not a whole process). In order to produce
such an Entity, there are 2 possibilities:

1. use a Factory,
2. produce a instance by hand.

First possibility might require some heavy setup in order to ensure that all constraints checked by the Factory are met.
Therefore, in some cases, second possibility is preferred. In order to prevent the manual configuration of such an 
Entity (set data and other Pousse-Café implementation details), `PousseCafeTest` defines a `newEntity` method which 
produces an empty instance. One may then only set the required attributes and run its test.

## Custom Message Listeners

In some circumstances, for instance when you want to react to a Domain Event in a non-domain service (e.g. a Spring 
Bean), you may define
custom message listeners. Custom message listeners are defined in the same way as Factory, Repository and Domain Process
listeners (i.e. using the `@MessageListener` annotation). The only difference is that you have to register them 
explicitly.

This is done by using `Runtime`'s `registerListenersOf` method:

    runtime.registerListenersOf(service)

where `service` is the instance of the service defining the listeners.

When integrating with Spring, beans extending `MessageListeningBean` have all their message listeners automatically
registered upon initialization.

## Message Listeners execution order

No assumption should be made on the order in which message listeners will be executed when handling a given message.
However, there are priority rules given the type of listener. Below list shows the order in which listener types are executed:

1. Repository listeners
2. Aggregate listeners
3. Factory listeners
4. Domain Process listeners
5. Custom listeners

So for example, if listeners of all types consume a message `M`, it will first be handled by listeners defined in 
Repositories, then in listeners defined in Aggregates, etc.

If several listeners are defined per type (e.g. Repository listeners), the order in which they are executed is 
undefined.

There are several goals behind above priority rule:

- Define "update only" listeners in Aggregates i.e. listeners that will not be executed on Aggregates that were
previously created while handling the same message;
- Re-create an aggregate by removing it using a Repository, then re-adding it with a Factory;
- Prevent the removal by a Repository of an Aggregate previously created by a Factory while handling the same message.

## Collision Handling

Once you deploy your application in a distributed environment, you will more than likely want to achieve high performance
and/or high availability which may both be obtained by multiplying the number of processing nodes. In the context of
a Pousse-Café application, this generally means that you will have several Pousse-Café Runtime instances executed by
different nodes running the same Modules and, therefore, the same sets of listeners.

The real issue is that you will start experiencing "collisions" i.e. several listeners trying to update or create the
same aggregate at the same time.

In a single node environment, even with several processing threads, Pousse-Café is able to prevent collisions. However,
in a multi-node environment, this is not possible.

Ideally, a model should be designed in a way that the probability of collision is reduced. Generally, this means
having many small Aggregates instead of a few big ones. However, it is sometimes not possible to prevent them
completely (i.e. the probability of collision cannot be reduced to zero).

To handle this issue, Pousse-Café implements a rather simple mechanism: when a collision is detected while running a
listener, the execution of the listener is retried a bit later, potentially several times, until the listener is
successfully executed.

Note that this mechanism implies that messages may not be handled in a strict sequence anymore: a retry may cause
that a message that was emitted before another one is actually handled after it. The Model has to be meant in a way
that supports this. If strict sequences are required, proper synchronization mechanisms have to be implemented.

### Detecting Collisions

Collisions are detected in two situations:

1. An update fails with an optimistic locking error,
2. An insertion fails with a duplicate key error when it should not (i.e. the insertion is expected to be successful).

First situation is rather obvious: the execution of the listener which failed with an optimistic locking error
must simply be retried.

Second situation is a bit more tricky: if a duplicate key error occurs, it should be detected as a collision only if
an update listener on the same aggregate was not executed because the aggregate did not exist at the time it was
executed. Indeed, this configuration means that another instance running in parallel created the aggregate in the
meantime. If this did not happen, the duplicate key error must be interpreted as a regular failure (i.e. probably
a bug).

The fact that a skipped update requires a subsequent creation is noticed via a `TargetAggregates<K>` instance
returned by a runner (see [Aggregate Root listeners](#in-an-aggregate-root)). For example, the following code inside
of Runner's `targetAggregates` method tells to Pousse-Café that Aggregate with ID `id` might be updated but if it
is not, then it must be created:

    MyAggregateId id = ...;
    if(...) { // Aggregate can be updated
        return new TargetAggregates.Builder<MyAggregateId>()
                .toUpdate(id)
                .build();
    } else { // The aggregate was not updated but its creation is expected
        return new TargetAggregates.Builder<MyAggregateId>()
                .toCreate(id)
                .build();
    }

The creation itself must be handled by a [Factory listener](#in-a-factory). Above logic is implemented by helpers
`UpdateOrCreateRunner` and `UpdateOrCreateOneRunner`. It is recommended to extend one of them when doing
"update or create" in a collision-prone environment.

Note that in a collision-free environment, the "else" block of above code is useless as creation will always be
executed in case no update was.

### Testing Code Collision-readiness

Pousse-Café [test runtime](#test-your-model) can be configured in a way that the probability of collision is increased,
enabling to test the readiness of code with regards to collision occurrence. To do so, the instance returned by 
`replicationStrategy` method of `PousseCafeTest` may be used as message listeners pool split strategy:

    @Override
    protected Builder runtimeBuilder() {
        return super.runtimeBuilder()
                .messageListenersPoolSplitStrategy(replicationStrategy(8))
                ...
                .build();
    }

`replicationStrategy` takes as an argument the number of threads that will execute in parallel the whole set of
listeners. The higher the number, the higher the probability of collision (but take the number of cores of executing
machine into account, with a single core, even a high number of threads will not produce much concurrency).

### Explicit Domain Processes and Custom Listeners

Currently, automated collision detection and handling is not available for explicit Domain Processes' listeners and
custom listeners. In those cases, collisions have to be handled explicitly by the developer.

## Spring Integration

Instantiating a Pousse-Café Runtime inside of a Spring application is easy thanks to Pousse-Café's Spring Bridge
(provided by `pousse-cafe-spring` project.

First, you'll need a Spring configuration class:

    @Configuration
    @ComponentScan(basePackages = { "poussecafe.spring" })
    public class AppConfiguration {
    
        @Bean
        public Bundles bundles(
                Messaging messaging,
                Storage storage) {
            MessagingAndStorage messagingAndStorage = new MessagingAndStorage(messaging, storage);
            return new Bundles.Builder()
                .withBundle(MyModule.configure().defineThenImplement().messagingAndStorage(messagingAndStorage).build())
                .build();
        }
    }

The `poussecafe.spring` package needs to be added to the component scan to build the bridge between Pousse-Café's
Runtime and Spring's application context (a dependency to ``pousse-cafe-spring`` needs to be added to your project). 
This will enable the injection
of Pousse-Café services as Spring beans and allow the injection of Spring beans in Pousse-Café services.

Note that the latter is not recommended as you would be bringing non-domain elements inside of your domain logic.

A Pousse-Café Runtime will be automatically instantiated with configured bundles and started once Spring context is
ready.

After that, you can access Domain Processes and Repositories directly from Spring components.

Below an example of a Spring Web controller allowing to submit commands to the Runtime via a REST resource:

    @RestController
    public class RestResource {
    
        @RequestMapping(path = "/product", method = RequestMethod.POST)
        public void createProduct(@RequestBody CreateProductView input) {
            ProductId productId = new ProductId(input.id);
            runtime.submitCommand(new CreateProduct(productId));
        }
    
        @Autowired
        private Runtime runtime;
    }

## Alternative Storage

### MongoDB

To implement an Aggregate with MongoDB Data and Data Access, Pousse-Café provides an integration (available via the
dependency ``pousse-cafe-spring-mongo``) with
[Spring Data MongoDB](https://projects.spring.io/spring-data-mongodb/).

Implementing an Aggregate (e.g. above `Product`) with MongoDB requires 3 classes/interfaces:

- ``ProductData`` data class, representing the document to insert/retrieve to/from a collection,
- ``MongoProductDataAccess`` data access class, accessing the documents,
- ``ProductDataMongoRepository`` interface required by Spring Data to do its magic.

`ProductData` is actually almost identical to the [implementation for internal storage](#aggregate-root). Spring
Data's ``@Id`` annotation just needs to be added above ``productId`` field.

`MongoProductDataAccess` looks like this:

    public class MongoProductDataAccess extends MongoDataAccess<ProductId, ProductData, String> implements  ProductDataAccess<ProductData> {
    
        @Override
        protected String convertId(ProductId id) {
            return id.getValue();
        }
    
        @Override
        protected MongoRepository<ProductData, String> mongoRepository() {
            return repository;
        }
    
        @Autowired
        private ProductMongoRepository repository;
    
        public List<ProductData> findByAvailableUnits(int availableUnits) {
            return repository.findByAvailableUnits(availableUnits);
        }
    }

`MongoDataAccess` super-class provides fills the gap between the Mongo repository and Pousse-Café's
Data Access interface. It is also responsible for the conversion between the Domain ID and the MongoDB-specific key
(which must be Java-serializable).

The `repository` field is annotated with `@Autowired`. This is a particular case where a Pousse-Café component (the Data Access) actually needs direct injection by Spring (see [Spring Integration](#spring-integration)).

`ProductDataMongoRepository` is the Spring Data repository interface defined as follows:

    public interface ProductMongoRepository extends MongoRepository<ProductData, String> {
    
        List<ProductData> findByAvailableUnits(int availableUnits);
    }

The Spring configuration then looks like this:

    @Configuration
    @ComponentScan(basePackages = { "poussecafe.spring" })
    public class AppConfiguration {
    
        @Bean
        public Bundles bundles(
                Messaging messaging,
                SpringMongoDbStorage storage) {
            MessagingAndStorage messagingAndStorage = new MessagingAndStorage(messaging, storage);
            return new Bundles.Builder()
                .withBundle(MyModule.configure().defineThenImplement().messagingAndStorage(messagingAndStorage).build())
                .build();
        }
    }

Unlike [previous example](#spring-integration), ``SpringMongoDbStorage`` is used instead of the default
storage implementation.

## Generating DDD documentation

Pousse-Café Doc generates DDD documentation based on a Pousse-Café project's source code. It uses javadoc
comments and the actual code to infer higher level documentation understandable by domain experts.

Pousse-Café's [Maven plugin](/pousse-cafe-maven-plugin/plugin-info.html) provides the `generate-doc` goal.
The goal is automatically executed during `package` phase.

`generate-doc` goal requires at least 2 properties to be defined:

- `domainName`: a name for the domain being modeled (used as the title of generated document);
- `basePackage`: the Java package in which Pousse-Café components to be documented are being searched for.

Below an example of configuration of the plugin where above properties are defined:

    <plugin>
      <groupId>org.pousse-cafe-framework</groupId>
      <artifactId>pousse-cafe-maven-plugin</artifactId>
      <version>{{ latest_release_version }}</version>
      <executions>
        <execution>
          <goals>
            <goal>generate-doc</goal>
          </goals>
          <phase>package</phase>
          <configuration>
            <domainName>iBoost</domainName>
            <basePackage>sbf.iboost</basePackage>
          </configuration>
        </execution>
      </executions>
    </plugin>

The way components are actually documented is described in the following sections.

### Module

A Module is defined by the components with their class in a base package or any of its sub-packages. Therefore,
a Module is documented by base package's `package-info.java`.

`@module` tag defines the name of the Module.

The javadoc comment's body is used as the description of the Module. HTML tags may be used for formatting.

`@short` tag defines the short (i.e. one sentence) description of the Module. The short description is used
in the Ubiquitous Language section of the documentation.

Example of `package-info.java` for package `mymodel`:

    /**
     * A long description for MyModel.
     *
     * @module MyModel
     * @short Short description for MyModel.
     */
    package mymodel;

### Aggregates

Each Aggregate is described in the javadoc comment on its Aggregate Root class (i.e. a class extending `AggregateRoot`).

The name of the Aggregate is the name of Aggregate Root's class.

The description of the Aggregate is given by javadoc comment's body. HTML tags may be used for formatting.

`@short` tag defines the short (i.e. one sentence) description of the Aggregate. The short description is used
in the Ubiquitous Language section of the documentation.

Example:

    /**
     * <p>Formatted description of an <em>Aggregate</em>.</p>
     * 
     * @short Short description of the Aggregate.
     */

An Aggregate must be part of a documented Module (i.e. it must be defined by a class in the documented Module's base 
package or one of its sub-packages). Otherwise, it will not be shown.

### Services

Each Service is described in the javadoc comment on its class (i.e. a class extending `Service`).

The name of the Service is the name of Service's class.

The description of the Service is given by javadoc comment's body. HTML tags may be used for formatting.

`@short` tag defines the short (i.e. one sentence) description of the Service. The short description is used
in the Ubiquitous Language section of the documentation.

Example:

    /**
     * <p>Formatted description of a <em>Service</em>.</p>
     * 
     * @short Short description of the Service.
     */

An Service must be part of a documented Module (i.e. it must be defined by a class in the documented Module's base 
package or one of its sub-packages). Otherwise, it will not be shown.

### Domain Processes

A Domain Process is essentially described by a directed graph where:

- nodes represent the *Steps* of the process i.e. the executed message listeners;
- edges represent a Domain Event being emitted by a source node (i.e. in the context of the execution of a Message 
  Listener) and handled by a destination node (i.e. another Message Listener).

Pousse-Café Doc is able to automatically discover the steps of a Domain Process by analyzing all defined message 
listeners. However, to build the edge set, Pousse-Café needs some hints.

The hints are given in the form of the list of Domain Events actually emitted by a Message Listener. With this
information, Pousse-Café Doc can connect the nodes together.

Furthermore, "virtual nodes" may be added to the graph to illustrate the fact that some events are coming from or going 
to non-domain components (in case of integration with an external system) or another Bounded Context.

#### Implicit Domain Processes

Implicit Domain Processes are defined without a sub-class of `DomainProcess`. All Message Listeners are defined in
Factories, Aggregate Roots or Repositories.

The name of the Steps are built using Message Listeners' method signature.

The description of each Step is taken from the javadoc comment on the Message Listener's method and its annotations.

`@process` tag is used to link the step to a given Domain Process. Several `@process` tags may be used to tell that
the step is part of several Domain Processes.

`@process_description` tag is used on one step of a Domain Process to set the short description of the Domain 
Process. The first word of the description is the name of the Domain Process this description is linked to.

`@ProducesEvent` annotation is used to tell which Domain Event is emitted by the Message Listener. Several 
`@ProducesEvent` annotations may be used if several Domain Events may be emitted. Also, `toExternals` attribute
may be used to tell that an emitted event is actually consumed by an external system or another module.

`@from_external` tag on a step implies the creation of a virtual node from which handled Domain Event is coming. 
This allows to describe situations where the consumed message is coming from a non-Domain component or another Bounded 
Context.

Example of a step part of Domain Process `DomainProcessName` and producing Domain Events `Event1` and `Event2`:

    /**
     * Step description.
     *
     * @process DomainProcessName
     * @process_description DomainProcessName Description of DomainProcessName
     */
     @ProducesEvent(Event1.class)
     @ProducesEvent(value = Event2.class, toExternals = {"System A", "System B"})

This comment and annotations come above the method implementing the Message Listener.

#### Explicit Domain Processes

Explicit Domain Processes are defined by sub-classes of `DomainProcess`. All Message Listeners are defined inside
a `DomainProcess` sub-class. In this case, Pousse-Café Doc requires an additional hint to link the Message Listeners
declared by the Domain Process class and the actual Steps declared in Factories, Aggregate Roots and Repositories.

The name of the Domain Process class is used as name of the Domain Process.

The javadoc comment on the Domain Process class is used as the description of the Domain Process.

`@step` tag is used to link a Message Listener of the Domain Process to the method actually implementing the Step:

- In the Domain Process class, `@step` tag is used in the Message Listener method and must be followed by a string 
with the following format: `Component.method` where
    - `Component` is the name of the containing components i.e. the name of the Aggregate Root, Factory or
      Repository class.
    - `method` is the name of the method actually consuming the Domain Event in the component.
- In the component, the `@step` tag is used on the method called by the Domain Processes' Message Listener and must be 
followed by a string  with the following format: `Component.method(Event)` where
    - `Component` is the name of the components i.e. the name of the Aggregate Root, Factory or
      Repository class.
    - `method` is the name of the tagged method.
    - `Event` is the Domain Event consumed (explicitly or not) by the method.

`@from_external` tag implies the creation of a virtual node from which handled Domain Event is coming. This allows
to describe situations where the consumed message is coming from a non-Domain component or another Bounded Context.

Example of a step part of Domain Process `DomainProcessName` (i.e. defined by a method of class 
`DomainProcessName`) consuming `Event1` and producing Domain Events `Event2` and `Event3`:

    /**
     * Step description.
     *
     * @step MyAggregate.handle
     */
    public void handle(Event1 event) {
       ...
    }

Above comment comes above the method implementing the Message Listener. Below snippet shows the comment and annotations 
that must be put above the method called by the Message Listener:

    /**
     * @step MyAggregate.handle(Event1)
     */
     @ProducesEvent(Event1.class)
     @ProducesEvent(value = Event2.class, toExternals = {"System A", "System B"})

An explicit Domain Process must be part of a documented Module (i.e. it must be defined by a class in the documented 
Module's base package or one of its sub-packages). Otherwise, it will not be shown.

Note that documenting an explicit Domain Process is way more cumbersome than documenting an implicit one. This is an 
additional argument for using explicit Domain Processes as little as possible.
