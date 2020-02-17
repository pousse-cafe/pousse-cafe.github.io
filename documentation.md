---
layout: page
title: Reference Guide
permalink: /doc/reference-guide/
---

## Table of Content

- [Introduction](#introduction)
- [Domain-Driven Design in a nutshell](#domain-driven-design-in-a-nutshell)
- [The purpose of Pousse-Café](#the-purpose-of-pousse-caf)
- [Quick Summary](#quick-summary)
- [Storage and Messaging](#storage-and-messaging)
- [Introducing Attributes](#introducing-attributes)
- [Implement Aggregates](#implement-aggregates)
- [Implement Services](#implement-services)
- [Handle Messages](#handle-messages)
- [Run your Model](#run-your-model)
- [Test your Model](#test-your-model)
- [Custom Message Listeners](#custom-message-listeners)
- [Message Listeners execution order](#message-listeners-execution-order)
- [Collision Handling](#collision-handling)
- [More on Attributes](#more-on-attributes)
- [Generating expert-readable documentation](#generating-expert-readable-documentation)
- [Spring Integration](#spring-integration)
- [Storage Plug-ins](#storage-plug-ins)
- [Messaging Plug-ins](#messaging-plug-ins)

## Introduction

The main purpose of Pousse-Café is to provide tools making the development of high quality and production-ready
[Domain-Driven Design (DDD)](https://en.wikipedia.org/wiki/Domain-driven_design)-based applications easier.

While DDD is an effective 
tool for designing applications with complex business needs, its actual implementation generally brings a set of
technical issues/questions that need to be addressed. Those questions and issues require a good knowledge
of DDD and some experience to be properly answered and solved.

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
- *Domain Events* are events issued when an Aggregate is updated. They can then trigger the update of other Aggregates,
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
(Aggregate, Service, etc). Pousse-Café defines a way of [implementing Aggregates](#implement-aggregates) preventing
this. In particular:
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
  executed by a [Runtime](#run-your-model);
- [Commands](#handle-messages) are submitted to the Runtime;
- Commands are handled by the Aggregates using [Message Listeners](#handle-messages);
- Aggregates issue [Domain Events](#handle-messages) which are also handled by Message Listeners;
- The set of Message Listeners executed following the submission of a Command defines a [Domain Process](#domain-processes);
- Aggregates may be grouped in [Modules](#module);
- Domain Events may cross Modules borders.

## Storage and Messaging

Pousse-Café works with "pluggable" Storage and Messaging systems:

- A Storage tells how to persist [Aggregates](#implement-aggregates) data.
- A Messaging tells how [Commands and Domain Events](#handle-messages) must be marshaled and transmitted.

A Storage is linked to each defined Aggregate. A Messaging is linked to each defined Command and Domain Event.
Different Aggregates may use different Storage systems. This is also true for Commands and Domain Events.
This feature is useful when migrating from one Storage/Messaging system to another for instance.

A Storage system may require transaction management. Pousse-Café does this automatically so that the developer should
almost never have to handle it manually (though [there might be exceptions](#in-an-explicit-domain-process)).

Pousse-Café handles Storage and Messaging as follows:

1. In reaction to a Command or a Domain Event, an Aggregate is [updated](#in-an-aggregate-root),
[created](#in-a-factory) or [deleted](#in-a-repository).
2. The change is persisted using Storage and, potentially, implying a transaction.
3. If persistence is successful (i.e. transaction was successfully committed if applicable), then issued Domain Events
are sent using the Messaging system.

Note that Commands are not sent using Messaging. They are inserted directly in an in-memory queue. Therefore,
Commands do not need to be "serializable".

## Introducing Attributes

Before describing the actual implementation of an Aggregate, the concept of Attribute must be introduced. It is central
to the decoupling of domain logic and persistence logic. This decoupling supports the "pluggable storage" feature of
Pousse-Café because it enables an abstract/domain-level description of the data model by separating it from
the actual data model used for persistence.

While the above could be achieved without Attributes, their use is recommended in order to simplify code and prevent
any accidental leak of technical details into domain logic.

An Attribute is an object encapsulating a value with a given type (the Attribute's type) and exposing a getter and
a setter for this value. It also hides the way the value is actually stored (you may for instance have a BigDecimal
Attribute actually storing its value in the form of a String). In that case, the implementation of the getter and
the setter includes conversion logic.

The purpose of Attributes is

1. to simplify the interface of an enclosing class: instead of having 2 methods (one for the getter, one for the setter),
a single method exposing the Attribute is enough,
2. to simplify client code when data conversion is needed (i.e. when the type of stored value is different from the type 
exposed),
3. to have an interface explicitly exposing an Attribute in the form of a single element (and not two with getter and
setter sharing the same name or being prefixed with get or set respectively).

The ``Attribute`` interface is defined as follows:

    public interface Attribute<V> {
      
         V value();
    
         void value(V value);
         
         default void valueOf(Attribute<T> property) {
             value(property.value());
         }
    }

It is then possible to define an enclosing interface like this:

    interface Example {
    
        Attribute<BigDecimal> x();
    }

Given a reference `r` to an instance of `Example`, setting `x` can be written as follows:

    r.x().value(new BigDecimal("42"))

Getting the value of `x` can be written as follows:

    r.x().value()

An implementation of `Example` could then look like this:

    class ExampleImpl implements Example {
    
        public Attribute<BigDecimal> x() {
            return AttributeBuilder.single(BigDecimal.class)
                .read(() -> x)
                .write(value -> x = value)
                .build();
        }
        
        private BigDecimal x;
    }

One could directly implement `Attribute` interface, but Pousse-Café provides an `AttributeBuilder` easing the
writing of Attribute implementations and preventing the explicit use of anonymous classes which would cripple the code.

In above example, `AttributeBuilder.single` returns an Attribute which expects a non-null value. If the value may be
null, use `AttributeBuilder.optional` and make this explicit in your interface by exposing an
`OptionalAttribute<T>` (which is essentially an `Attribute<Optional<T>>`).

Let's now imagine that we need to persist instances of `Example`. Let's also imagine that the persistence tool
we are using is able to persist the private fields of an object but does not support BigDecimal type. We still want
`Example` to expose a BigDecimal Attribute but we need to store it using another type (e.g. String). Another possible 
implementation of `Example` could be

    class PersistableExampleImpl implements Example {
    
        public Attribute<BigDecimal> x() {
            return AttributeBuilder.single(BigDecimal.class)
                .usingDataAdapter(DataAdapters.stringBigDecimal())
                .read(() -> x)
                .write(value -> x = value)
                .build();
        }
        
        private String x;
    }

In above code, `DataAdapters.stringBigDecimal()` returns an implementation of `DataAdapter<String, BigDecimal>`.
`DataAdapter<S, T>` where `S` is the type of stored value and `T` the type of the value to store, is an interface
defining two methods, `T adaptGet(S)` and `S adaptSet(T)`, respectively
converting the stored value and the value to store. One can directly implement its own implementation of `DataAdapter` and 
provide it to
`usingDataAdapter` but Pousse-Café already comes with a couple of [common ones](#common-data-adapters) defined in
`DataAdapters`.

Above approach (`Example` interface exposing an Attribute with a given type and an implementation using another type
for persistence) enables the writing of code that interacts with an abstraction `Example` independently of persistence
details (persisted type, conversion, etc.) which illustrates the second purpose of Attributes described at the beginning
of this section.

More information regarding Attributes can be found in [this section](#more-on-attributes).

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
units available, the `OrderPlaced` Event is issued. Otherwise, the `OrderRejected` Event is issued.

    @Aggregate(
        factory = ProductFactory.class,
        repository = ProductRepository.class,
        module = Shop.class
    )
    public class Product extends AggregateRoot<ProductId, Product.Attributes> {
        ...
    
        @MessageListener(runner = PlaceOrderRunner.class, processes = OrderPlacement.class)
        @ProducesEvent(value = OrderRejected.class, required = false)
        @ProducesEvent(value = OrderPlaced.class, required = false)
        public void placeOrder(PlaceOrder command) {
            int unitsAvailable = attributes().availableUnits().value();
            OrderDescription description = command.description().value();
            if (description.units() > unitsAvailable) {
                OrderRejected event = newDomainEvent(OrderRejected.class);
                event.productId().valueOf(attributes().identifier());
                event.description().value(description);
                issue(event);
            } else {
                attributes().availableUnits().value(unitsAvailable - description.units());
    
                OrderPlaced event = newDomainEvent(OrderPlaced.class);
                event.productId().valueOf(attributes().identifier());
                event.description().value(description);
                issue(event);
            }
        }
    
        public static interface Attributes extends EntityAttributes<ProductId> {
            ...
    
            Attribute<Integer> availableUnits();
        }
    }

The ``@Aggregate`` annotation explicitly links the Root to the Aggregate's Factory and Repository.
It is required by [Pousse-Café's Runtime](#run-your-model) in order to detect it. `@Aggregate`'s `module` annotation
links the Aggregate to a
given Domain Module. A Module is defined by an interface or a class extending or implementing the 
`poussecafe.domain.Module` interface. The `module` attribute is optional, by default an Aggregate is put in the
default Module.

All Aggregates (and other components like Value Objects, Entities, Services and Domain Processes) in the Module must be
defined in sub-packages of the Module definition class (i.e. if a Module class is
in package `x.y.z`, then Aggregate classes must be in package `x.y.z` or in a sub-package). The default Module is
attached to the default Java package.

`@MessageListener` and `@ProducesEvent` annotate a Message Listener i.e. a method which handles
a given Command or Domain Event (see [below](#handle-messages) for an extended explanation on this).

Aggregate Root's ``newDomainEvent`` method returns a new instance of Domain Event implementation.

Aggregate Root's ``issue`` method queues the Domain Event for issuance after the Aggregate is successfully persisted.

The ``Product.Attributes`` interface defines the data model of an Entity (and in particular, the Aggregate Root).
Each attribute is defined by a method
returning an instance of ``Attribute<V>`` where ``V`` is the type of the attribute.

The type of the value of an Attribute may be a primitive type, a Value Object (i.e. a class extending `ValueObject`)
or a collection aforementioned types. Regular POJOs may be used as well but the Attributes of an Entity should be as
much as possible expressed in terms of Domain terms in order to prevent any leak of non-domain elements.

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

This implementation is serializable and is therefore suitable, for example, for Pousse-Café's internal memory-based
storage (``InternalStorage``). [Other storage types](#storage-plug-ins) might require additional enrichment of
the data (annotations, etc.).

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


### Aggregate life-cycle hooks

An Aggregate is modified by 3 operation types:

- Creation
- Update
- Deletion

An Aggregate Root may react to those operations by updating its attributes and/or issuing Domain Events. In order to do so,
the following methods may be overridden:

- `onAdd`
- `onUpdate`
- `onDelete`

Below example illustrates the emission of a Domain Event upon creation of a new `Product` aggregate:

    @Aggregate(
        factory = ProductFactory.class,
        repository = ProductRepository.class,
        module = Shop.class
    )
    public class Product extends AggregateRoot<ProductId, Product.Attributes> {
        
        @Override
        public void onAdd() {
            ProductCreated event = newDomainEvent(ProductCreated.class);
            event.productId().valueOf(attributes().identifier());
            issue(event);
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
    boolean existsById(K id);

where

- `find` returns an Aggregate of null if none was found,
- `get` returns an Aggregate or throws an exception if the Aggregate was not found,
- `add` allows to add a new Aggregate,
- `update` updates an existing aggregate,
- `delete` removes an Aggregate from storage if it was present,
- `existsById` returns true if an Aggregate is present in storage for given identifier, false otherwise.

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
which creates all required classes as well as adapters for a [specific storage plug-in](#storage-plug-ins) if needed.

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

A Message Listener may be part of one or several Domain Processes. `@MessageListener`'s `processes` attribute
enables the linking of a Message Listener with a set of interfaces or classes (extending or implementing
`poussecafe.domain.Process`), each describing a Domain Process.
This attribute is optional. By default, a Message Listener is linked to the default Domain Process.

Note that this information is currently not used at runtime. However, it enables:

- embedded documentation for developers, putting a given Message Listener in a context for the developer reading the code;
- the [generation of expert-readable documentation](#generating-expert-readable-documentation).

### In a Factory

Factory message listeners are used to create Aggregates when handling a Domain Event.

Below example illustrates listeners in a Factory:

    public class MyAggregateFactory extends Factory<...> {
    
        @MessageListener(processes = Process1.class)
        public MyAggregate createMyAggregate(Event1 event) {
            ...
        }
    
        @MessageListener(processes = Process2.class)
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
    
        default Object context(M message, A aggregate) { ... }
    }

``targetAggregates`` defines the IDs of the Aggregates to update given an event. It also allows to define the
IDs of the Aggregates whose creation is expected because they cannot be updated (see section about
[collision handling](#collision-handling)).

``context`` returns the data required to execute the update i.e. information coming potentially from other
Aggregates or external configuration. The use of an update context is not recommended but may be required in some
cases. By default, no context is returned (i.e. `context` returns null).

Below example illustrates the runner for the listener in above example:

    public class UpdateAggregateRunner implements AggregateMessageListenerRunner<Event2, MyAggregateId , MyAggregate> {
    
        public TargetAggregates<MyAggregateId> targetAggregates(Event2 message) {
            return new TargetAggregates.Builder<MyAggregateId>().toUpdate(message.id().value()).build();
        }
    }

Note that there cannot be several listeners per Aggregate consuming the same message.

In order to accelerate the writing of runners, helpers exist for common situations:

- `UpdateSeveralRunner`: update target aggregates (they must exist)
- `UpdateOneRunner`: always update the target aggregate (target aggregate must exist)
- `UpdateOneOrNoneRunner`: update a target aggregate or none depending on a given condition
- `UpdateIfExistsRunner`: update each target aggregate if it exists
- `UpdateOneIfExistsRunner`: update the target aggregate if it exists
- `UpdateOrCreateRunner`: update the target aggregates or expect the creation if them if they do not exist (a factory 
listener must handle this)
- `UpdateOrCreateOneRunner`: update the target aggregate or expect its creation if it does not exist (a factory
listener must handle this)

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

Sometimes, defining message listeners at Factory, Aggregate Root and Repository level is not enough because it does not
enable the definition of more complex handling patterns. This is the purpose of *Explicit Domain Processes*.

An Explicit Domain Process is a non-Domain service which contains message listeners.
It is defined by a class extending ``DomainProcess``.
An Explicit  Domain Process routes Domain Events or Commands to an actual Aggregate Root, Factory or Repository,
potentially by first applying some custom processing.

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

In order to keep the code base as small (i.e. boilerplate-less) and clean as possible, it is recommended to use Domain 
Processes only when
required. In other words, put as many message listeners in Factories, Aggregate Roots and Repositories as possible.
Explicit Domain Processes are kept for the very rare cases where this approach is not possible.

### Enrich Listeners Description

A message listener may be annotation with `ProducesEvent` annotation. This annotation tells which type of
Domain Event is issued by the message listener upon execution and if the issuance is optional or not.
Putting this annotation on the listener enables a check by the Runtime that expected events are actually issued.
If it is not the case, the execution of the listener fails and an exception is thrown, allowing to detect early the
issue.

This feature is particularly interesting when [testing the model](#test-your-model) but is also used to [generate
model's expert-readable documentation](#generating-ddd-documentation).

## Run your model

The definitions and implementations of Aggregates and Services of a given Module are grouped in a Bundle.
A Bundle may include components of different Modules.

One or several Bundles may be instantiated in a Pousse-Café ``Runtime``. Upon creation, the 
Runtime instantiates all required services and injects them when necessary. It also gives access to 
Aggregates via their Repository and Factory.

The preferred way to create a Bundle is to use a ``BundleConfigurer``.

Below example illustrates the creation of a BundleConfigurer by automatically loading all Domain components and 
implementations available in a Module:

    public class MyBundle {
    
        private MyBundle() {
    
        }
    
        public static BundleConfigurer configure() {
            return new BundleConfigurer.Builder()
                    .module(MyModule.class)
                    .build();
        }
    }

If no Module has been defined (i.e. all Aggregates are in the default Module), `DefaultModule` may be loaded.
However, this is not recommended because it implies the scanning of **all** classes in the classpath.

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

    Bundle bundle = MyBundle.configure()
        .defineAndImplementDefault()
        .build();
    Runtime runtime = new Runtime.Builder()
        .withBundle(bundle)
        .build();
    runtime.start();

``defineAndImplementDefault`` method returns a Bundle builder that will use internal storage and messaging.
In order to use another storage and messaging, use `defineThenImplement`.

A call to ``Runtime``'s ``start`` method actually starts the consumption of messages by listeners. The call to
`start` is non blocking.

After that, commands may be submitted to the Runtime using `submitCommand` and Aggregates retrieved using their 
Repository.

Repositories are automatically injected by the Runtime in any registered service. For external services (i.e. non-domain
services), Repositories may be retrieved from ``Runtime``'s ``Environment`` using the following methods:

- ``runtime.environment().domainProcess(domainProcessClass)`` where ``domainProcessClass`` is the class of the Domain Process to retrieve.

A [Spring integration](#spring-integration) exists enabling direct injection of Domain component in Spring beans
and vice versa up to some extent.

## Test your model

Pousse-Café provides tools allowing to easily test your model with no heavy storage setup required.
Actually, you might write your whole Domain logic even before deciding what kind of
storage you would be using. More importantly, it means that you can focus your tests on the Domain.

For testing, it is suggested to use the default in-memory storage implementation provided by Pousse-Café.
When actually integrating your Model in a real application, you could
then just choose another implementation [when building the Runtime](#run-your-model).

`PousseCafeTest` class can be extended to write (e.g. JUnit) tests involving different Bundles.
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

In some circumstances, for instance when you want to react to a Domain Event in a component that is not managed by
Pousse-Café's Runtime (e.g. a Spring Bean), you may define
custom message listeners. Custom message listeners are defined in the same way as Factory, Repository and Domain Process
listeners (i.e. using the `@MessageListener` annotation). The only difference is that you have to register them 
explicitly.

This is done by using `Runtime`'s `registerListenersOf` method:

    runtime.registerListenersOf(service)

where `service` is the instance of the service defining the listeners.

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
that a message that was sent before another one is actually handled after it. The Model has to be meant in a way
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

## More on Attributes

Attributes [were introduced](#introducing-attributes) previously. This section describes the feature further.

### Auto-Adapters

Attributes can convert data using `DataAdapter<S, T>` instances (where `S` is the type of stored value and `T` the
type of the Attribute). When `S` is a "primitive" type (i.e. a type supported by persistence tool), this is the
preferred approach. When `S` and `T` are custom types (e.g. Value Objects), two classes have to be written:
`S` and the custom Data Adapter.

The problem is that most of the time, touching the custom type implies a modification
of the custom Data Adapter as well. Therefore, it makes sense to actually group the data and their conversion logic in the same
class, even if this breaks the
[single responsibility principle](https://en.wikipedia.org/wiki/Single_responsibility_principle).

This is the purpose of the auto-adapter: a class that contains the fields to be persisted as well as the logic to
create that class based on the Attribute value or create an Attribute value based on stored data. The persistence
tool must be able to persist an auto-adapter directly (e.g. if using Java serialization, the auto-adapter must
implement `Serializable`).

An auto-adapter is a class that has at least 2 methods:

- `static S adapt(T)`
- `T adapt()`

The first method instantiates the auto-adapter from an Attribute's value. The second method instantiates the value
of the Attribute based on its state.

Let's take the example of a Value Object:

    public class Example implements ValueObject {
    
        public Example(String value) {
            Objects.requireNonNull(value);
            this.value = value;
        }
        
        private String value;
        
        public String value() {
            return value;
        }
    }

Most persistence tools cannot persist this kind of class because it does not define a no-argument constructor.
That constructor should not be added to the VO because it allows the creation of an instance that does not fulfill
the constraints on encapsulated data (here, the fact that `value` must not be null).

When persisting using Java serialization, the auto-adapter for `Example` looks like this:

    public class ExampleData implements Serializable {
    
        public static ExampleData adapt(Example example) {
            ExampleData data = new ExampleData();
            data.value = example.value();
            return data;
        }
        
        private String value;
        
        public Example adapt() {
            return new Example(value);
        }
    }

The auto-adapter both has a no-arg constructor (the default constructor) and implements `Serializable` interface.
At the same time, `Example` VO was not polluted with technical details nor where its consistency rules relaxed.

Given above example, an Attribute with type `Example` can be implemented as follows:

    public Attribute<Example> example() {
        AttributeBuilder.single(Example.class)
            .usingAutoAdapter(ExampleData.class)
            .read(() -> example)
            .write(value -> example = value)
            .build();
    }
    
    private ExampleData example;

### Specific Attributes

Specialized forms of `Attribute<T>` are provided by Pousse-Café in order to facilitate the use of Attributes with
common types:

- `OptionalAttribute<T>`: essentially implements `Attribute<Optional<T>>`;
- `NumberAttribute<T>`: adds the possibility to add an amount to an Attribute in-place;
- `ListAttribute<T>`: adds direct access to `List` specific operations on the Attribute's value;
- `MapAttribute<T>`: adds direct access to `Map` specific operations on the Attribute's value;
- `SetAttribute<T>`: adds direct access to `Set` specific operations on the Attribute's value.

`NumberAttribute`'s builder requires an addition operator, Pousse-Café provides some common addition operators in
the `AddOperators` class. Here is a full example of building a `NumberAttribute<BigDecimal>` instance:

    AttributeBuilder.number(BigDecimal.class)
            .get(() -> bigDecimal)
            .write(value -> bigDecimal = value)
            .addOperator(AddOperators.BIG_DECIMAL)
            .build()

If `r` references a `NumberAttribute<BigDecimal>` Attribute, then the following statement causes the value `r` to
be incremented:

    r.add(BigDecimal.ONE)

which is equivalent to

    r.value(r.value().add(BigDecimal.ONE))

but in shorter and more readable.

Note that the collection-based Attributes always return unmodifiable collections. Attempts to alter them will throw an
exception.

### Common Data Adapters

The class `poussecafe.attribute.adapters.DataAdapters` contains a collection of factory methods instantiating
common data adapters.

### Entity Attributes

Entity Attributes enable the implementation of one-to-one and one-to-many relations between entities. Many-to-many
relations are implemented using an additional Aggregate acting as the relation between other Aggregates.

Entity Attributes i.e. Attributes whose type is a sub-class of `poussecafe.domain.Entity` require a different
approach because:

- altering individual Attributes of an Entity has to update immediately the data (i.e. the value returned by an Entity
Attribute is mutable, which should generally not be the case),
- Domain Events issued while interacting with an Entity are queued at the Aggregate level.

Therefore, there is a need for an intermediate class `EntityAttribute<E extends Entity>` which builds a
`Attribute<E>` when given a reference to the Aggregate Root.

Inside of an Aggregate Root's method, in order to obtain a instance of `Attribute<E>`, the following statement must
be written:

    attributes().entity().inContextOf(this)

The following snippet illustrates how to set the value of an Entity Attribute:

    var newEntity = setNew(attributes().entity()).withKey(someId);

`newEntity` can then be used to directly alter Entity's state or call some of its methods.

The `OptionalEntityAttribute` is similar to `EntityAttribute` but supports the case where no Entity is available.

Both `EntityAttribute` and `OptionalEntityAttribute` implement a one-to-one relation.

`EntityMapAttribute` enables the implementation of one-to-many relations. It also has a method called `inContextOf`
which returns a `MapAttribute<K, E extends Entity>`.

The following snippet illustrates how to put a new Entity in the Entities map:

    var newEntity = map.putNew(someId).inContextOf(this);

Again, `newEntity` can then be used to directly alter Entity's state or call some of its methods.


## Generating expert-readable documentation

Pousse-Café Doc generates DDD expert-readable documentation based on a Pousse-Café project's source code. It uses javadoc
comments and the actual code to infer a higher level documentation understandable by domain experts.

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

A Module is defined by interfaces or classes extending or implementing `poussecafe.domain.Module`.

The name of the Module is the name of Module's class.

The javadoc comment's body is used as the description of the Module. HTML tags may be used for formatting.

`@short` tag defines the short (i.e. one sentence) description of the Module. The short description is used
in the Ubiquitous Language section of the documentation.

Example:

    /**
     * <p>Formatted description of a <em>Module</em>.</p>
     * 
     * @short Short description of the Module.
     */

### Module Components

Each Module Component (Aggregate, Entity, Value Object, Service and Domain Process) is described in the javadoc comment
on its class (i.e. a class extending respectively `AggregateRoot`, `Entity`, `ValueObject`, `Service` or
`Process`).

The name of the component is the name of the class.

The description of the component is given by javadoc comment's body. HTML tags may be used for formatting.

`@short` tag defines the short (i.e. one sentence) description of the component. The short description is used
in the Ubiquitous Language section of the documentation.

Example:

    /**
     * <p>Formatted description of an <em>Aggregate</em>.</p>
     * 
     * @short Short description of the Aggregate.
     */

`@ignore` tag used at class level or on methods tells that the component itself or a link to other
components must be ignored i.e. the component or the link is not documented.

`@trivial` tag used at class level tells that there is no need for a description (e.g. a Value Object named
MyAggregateId is obviously the identifier of Aggregate MyAggregate).

Above components must be part of a Module. The Aggregate is attached to a Module through the `module` of
`@AggregateRoot`. The other components are attached to a Module using the `@Module` annotation, its value being
a Module class. The package of the component class must be compatible with the Module package: it must be the same as
or a sub-package of the Module definition classes package (i.e. if a Module class is in package `x.y.z`, then Domain
Process class must be in package `x.y.z` or in a sub-package).


### Domain Processes

A Domain Process is essentially described by a directed graph where:

- nodes represent the *Steps* of the process i.e. the executed message listeners;
- edges represent a Domain Event being issued by a source node (i.e. in the context of the execution of a Message 
  Listener) and handled by a destination node (i.e. another Message Listener).

Pousse-Café Doc is able to automatically discover the steps of a Domain Process by analyzing all defined message 
listeners. It uses `@MessageListener` and `@ProducesEvent` annotations to do so.

The name of the Domain Process is the name of a class extending `poussecafe.domain.Process`.

The description of the Domain Process is given by javadoc comment's body. HTML tags may be used for formatting.

`@Module` annotation can be used to explicitly bind a Domain Process to a Module. The package of the Domain Process
class must be compatible with the Module package: it must be the same as or a sub-package of the Module definition
classes package (i.e. if a Module class is in package `x.y.z`, then Domain Process class must be in package `x.y.z`
or in a sub-package).

Furthermore, "virtual nodes" may be added to the graph to illustrate the fact that some events are coming from or going 
to non-domain components (in case of integration with an external system) or other Modules.

This is controlled by
- `@MessageListener`'s `consumesFromExternal` attribute which contains a list of names
identifying the non-domain components or Modules producing the message consumed by the Message Listener;
- `@ProducesEvent`'s `consumedByExternal` attribute which contains a list of names
identifying the non-domain components or Modules consuming the message produced by the Message Listener;

## Spring Integration

Instantiating a Pousse-Café Runtime inside of a Spring application is easy thanks to Pousse-Café's
[Spring Bridge](https://github.com/pousse-cafe/pousse-cafe-spring). See project README for more details about how
to do so.

## Storage Plug-Ins

The following plugins are currently available:

- [Pousse-Café Spring Mongo](https://github.com/pousse-cafe/pousse-cafe-spring-mongo)
- [Pousse-Café Spring JPA](https://github.com/pousse-cafe/pousse-cafe-spring-jpa)

## Messaging Plug-Ins

The following plugins are currently available:

- [Pousse-Café Spring Pulsar](https://github.com/pousse-cafe/pousse-cafe-spring-pulsar)
- [Pousse-Café Spring Kafka](https://github.com/pousse-cafe/pousse-cafe-spring-kafka)
