---
layout: page
title: Reference Guide
permalink: /doc/reference-guide/
---

## Content

- [Introduction](#introduction)
- [Domain-Driven Design in a nutshell](#domain-driven-design-in-a-nutshell)
- [The purpose of Pousse-Café](#the-purpose-of-pousse-caf)
- [Implement Aggregates](#implement-aggregates)
- [Implement Services](#implement-services)
- [Handle Domain Events](#handle-domain-events)
- [Handle Commands](#handle-commands)
- [Run your Bounded Context](#run-your-bounded-context)
- [Test your Bounded Context](#test-your-bounded-context)
- [Spring Integration](#spring-integration)
- [Alternative Storage](#alternative-storage)

## Introduction

The main purpose of Pousse-Café is to provide tools making the development of high quality and production-ready [Domain-Driven Design
(DDD)](https://en.wikipedia.org/wiki/Domain-driven_design)-based applications easier.

While DDD is an effective 
tool for designing applications with complex business needs, its actual implementation generally brings a set of
technical issues/questions that need to be addressed. Those questions and issues require a good knowledge
of DDD to be properly handled.

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
  details like opening a DB transaction and committing it. Pousse-Café provides tools enabling to achieve this in the 
  cleanest possible way.
- Evaluating that a given Domain Model implementation actually fits the Domain Model involves domain experts.
  A GUI or test cases do not always show the full complexity of a given Domain Model.
  At the same time, it is, most of the time, not a viable option to have domain experts directly review the code.
  An approach
  enabled by Pousse-Café is to generate a domain-expert-readable documentation (i.e. a PDF file written in
  natural language) from the code which can be reviewed by domain experts.

Pousse-Café relies on the definition of a *Bounded Context* which is composed of the Domain components as well as
Domain Processes. The goal is to define the Domain logic in a way that is as independent as possible of underlying
technologies and then instantiate it in an actual application by plugging in the required adapters.

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
    public class Product extends EntityAttributes<ProductId, Product.Attributes> {
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

An Aggregate is at least composed of

- an Aggregate Root,
- a Factory and
- a Repository.

The ``@Aggregate`` annotation can be used to explicitly related those 3 components. It is used to configure
a Bounded Context (see [below](#run-your-bounded-context)).

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
(``InternalStorage``). This storage's purpose is testing, it should not be used by production code.

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

``@MessageImplementation`` annotation relates the data implementation to a given event. It is used
[when instantiating a Bounded Context](#run-your-bounded-context). Above implementation is serializable which makes
it suitable for Pousse-Café's internal messaging (``InternalMessaging``). This messaging's purpose is testing, it should not be used by production code.


Aggregate Root's ``newDomainEvent`` method returns a new instance of Domain Event implementation.

Aggregate Root's ``emitDomainEvent`` method queues the Domain Event for emission after the Aggregate is successfully persisted.

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
when [configuring the Bounded Context](#run-your-bounded-context).

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

The data access implementation defined for the Repository must implement the interface.

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
aggregate. ``storageName`` attribute is used when [instantiating a Pousse-Café Runtime](#run-your-bounded-context).
Implementations not matching the chosen storage are ignored.

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
The ``@ServiceImplementation`` annotation can then be used to annotate the actual implementation and link it to
the abstract service using attribute ``service``.


## Handle Domain Events

Domain Events are directly handled by Domain components i.e. Aggregate Roots, Factories or Repositories.

The ``@MessageListener`` annotation is used to annotate a method that should handle a Domain Event.

### In a Factory

Factory message listeners are used to create Aggregates when handling a Domain Event.

Below example illustrates listeners in a Factory:

    public class MyAggregateFactory extends Factory {

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
it.

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

``updateAggregate`` updates the Aggregate in function of consumed ``Event1``. Pousse-Café automatically starts a transaction and commits it if the storage requires it.

The identity of the Aggregates to update needs to be extracted from the event. Therefore, message listeners defined in
Aggregate Roots require a ``AggregateMessageListenerRunner<M, K, A>`` where

- ``M`` is the class of the consumed event,
- ``K`` is the class of Aggregate's identifier,
- ``A`` is the Aggregate Root's class.

A ``AggregateMessageListenerRunner`` is defined as follows:

    public interface AggregateMessageListenerRunner<M, K, A> {

        Set<K> targetAggregatesIds(M message);
    
        Object context(M message, A aggregate);
    }

``targetAggregatesIds`` returns the IDs of the Aggregates to update given an event.

``context`` returns the data required to execute the update i.e. information coming potentially from other
Aggregates or external configuration. The use of an update context is not recommended but may be required in some
cases.

Below example illustrates the runner for the listener in above example:

    public class UpdateAggregateRunner extends DefaultAggregateMessageListenerRunner<Event2, MyAggregateId , MyAggregate> {

        public Set<MyAggregateId> targetAggregatesIds(Event2 message) {
            ...
        }
    }

``DefaultAggregateMessageListenerRunner`` extends ``AggregateMessageListenerRunner`` and simply implies an
empty update context.

The Aggregates updated by a given event ``Event1`` are identified by the identifiers returned by ``targetAggregatesIds``.

### In a Repository

Repository message listeners are used to remove Aggregates when handling a Domain Event.

Below example illustrates a listener in a Repository:

    public class MyAggregateRepository extends Repository {

        @MessageListener
        public void deleteAggregate(Event3 event) {
            ...
        }
    }


### In a Domain Process

Sometimes, defining message listeners at Factory, Aggregate Root and Repository level is not enough and does not allow
to define more complex handling patterns. This is the purpose of *Domain Processes*.

A Domain Processes is a non-Domain service which defines listeners that consume Domain Events.
It is defined by a class extending ``DomainProcess``.
A Domain Process routes Domain Events to an actual Aggregate Root, Factory or Repository.

Below example shows an example of Domain Process.

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
means depends on the storage technology used for related Aggregate.

Note that above example is equivalent to defining the message listener in ``MyAggregate`` class and defining a runner
than returns a single ID equal to ``event.id().value()``.

In order to keep the code base as small and clean as possible, it is recommended to use Domain Processes only when
required. In other words, put as many message listeners in Factories, Aggregate Roots and Repositories as possible.


## Handle Commands

Commands represent external triggers (i.e. not emitted Domain Events) causing the creation, update or removal of Aggregates. A Command is generally represented as a simple object containing all required information to execute the
command.

Commands are handled by Domain Processes in methods taking the Command as single argument.

Below example shows an example of Domain Process handling a Command.

    public class MyDomainProcess extends DomainProcess {

        public void handleCommand(Command1 command) {
            runInTransaction(MyAggregate.class, () -> {
                MyAggregate aggregate = repository.get(event.id().value());
                aggregate.handle(command);
                repository.update(aggregate);
            });
        }

        private MyAggregateRepository repository;
    }


## Run your Bounded Context

The Aggregates, Services and Domain Processes implementing a given Domain Model are grouped in a Bounded Context.

One or several Bounded Contexts are used to instantiate a Pousse-Café ``Runtime``. Upon creation, the Runtime instantiates all required services and injects them when necessary. It also gives access to Aggregates via their related
Repository and Factory.

The simplest way of implementing a Bounded Context is to use a *Configurer*.

Below example illustrates the creation of a Configurer by automatically loading all Domain components and implementations
available in a given package:

    public class MyBoundedContext {
    
        private MyBoundedContext() {
    
        }
    
        public static BoundedContextConfigurer configure() {
            return new BoundedContextConfigurer.Builder()
                    .packagePrefix("poussecafe.myboundedcontext")
                    .build();
        }
    }

The Configurer uses the following annotations to discover the Domain components to load:

- ``@Aggregate``
- ``@MessageImplementation``
- ``@DataAccessImplementation``
- ``@ServiceImplementation``
- ``@MessageListener``

In addition, sub-classes of the following interfaces/classes are automatically loaded as well:

- ``Service``
- ``DomainProcess``

The Configurer is used to instantiate a Bounded Context and provide it to a Runtime which may, finally, be started:

    BoundedContext boundedContext = MyBoundedContext.configure()
        .defineAndImplementDefault()
        .build();
    Runtime runtime = new Runtime.Builder()
        .withBoundedContexts(boundedContext)
        .build();
    runtime.start();

``defineAndImplementDefault`` method returns a Bounded Context builder that will use internal storage and messaging.

A call to ``Runtime``'s ``start`` method actually starts the consumption of emitted Domain Events by message listeners.
The call to `start` is non blocking.

After that, commands may be submitted to Domain Processes and Aggregates retrieved using their Repository.
Domain Processes and Repositories may be retrieved from ``Runtime``'s ``Environment`` using the following methods:

- ``runtime.environment().domainProcess(domainProcessClass)`` where ``domainProcessClass`` is the class of the Domain Process to retrieve,
- ``runtime.environment().repositoryOf(aggregateRootClass)`` where ``aggregateRootClass`` is the class of the Aggregate's Root.

## Test your Bounded Context

Pousse-Café provides some tools allowing to easily test your Bounded Context with no heavy storage setup required.
Actually, you might write your whole Domain logic even before deciding what kind of
storage you would be using. More importantly, it means that you can focus your tests on the Domain.

For testing, it is suggested to use the default in-memory storage implementation provided by Pousse-Café.
When actually integrating your Bounded Context in a real application, you would
then just choose another implementation [when building your Bounded Context](#run-your-bounded-context).

`PousseCafeTest` class can be extended to write (JUnit 4) tests involving parts of the
Bounded Context. What this class does is essentially instantiate a Runtime and provide some
helpers to access its components.

Below example illustrates a test verifying that the handling of "Create Product" command actually implies the new
product to be available from the Repository.

    public class ProductManagementTest extends PousseCafeTest {

        @Override
        protected List<BoundedContext> boundedContexts() {
            return asList(SampleBoundedContextDefinition.configure().defineAndImplementDefault().build());
        }

        @Test
        public void productCanBeCreated() {
            ProductId productId = new ProductId("product-id");
            productManagement.createProduct(new CreateProduct(productId));
            assertThat(find(Product.class, productId), notNullValue());
        }
        
        private ProductManagement productManagement;
    }

`boundedContexts` method defines the Bounded Contexts to test.

The instance of ``ProductManagement`` Domain Process handling "Create Product" command is injected automatically.

`find` method is a shortcut that retrieves an Aggregate from its Repository.
`find` also waits that all
Domain Events published when executing the command are actually consumed. This ensures that there will be no race
condition between the asynchronous handling of Domain Events and the fact that the Aggregate being fetched might be
created as a consequence of the consumption of one of those events.

## Spring Integration

Instantiating a Pousse-Café Runtime inside of a Spring application is easy. First, you'll need a
Spring configuration class:

    @Configuration
    @ComponentScan(basePackages = { "poussecafe.spring" })
    public class AppConfiguration {

        @Bean
        public Runtime pousseCafeRuntime() {
            BoundedContext boundedContext = MyBoundedContext.configure()
                .defineAndImplementDefault()
                .build();
            Runtime runtime = new Runtime.Builder()
                .withBoundedContexts(boundedContext)
                .build();
            runtime.start();
            return runtime;
        }
    }

The `poussecafe.spring` package needs to be added to the component scan to build the bridge between Pousse-Café's
Runtime and Spring's application context (an dependency to ``pousse-cafe-spring`` needs to be added to your project). 
Basically, this will enable the injection
of Pousse-Café services as Spring beans and allow the injection of Spring beans in Pousse-Café services.

Note that the latter is not recommended as you would be bringing non-domain elements inside of your domain logic.

After that, you can access Domain Processes and Repositories directly from Spring components.

Below an example of a Spring Web controller allowing to submit commands to a Domain Process command via a REST resource:

    @RestController
    public class RestResource {

        @RequestMapping(path = "/product", method = RequestMethod.POST)
        public void createProduct(@RequestBody CreateProductView input) {
            ProductId productId = new ProductId(input.id);
            productManagement.createProduct(new CreateProduct(productId));
        }

        @Autowired
        private ProductManagement productManagement;
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
        public Runtime pousseCafeRuntime() {
            MessagingAndStorage messagingAndStorage = new MessagingAndStorage(InternalMessaging.instance(),
                    SpringMongoDbStorage.instance());

            Runtime context = new Runtime.Builder()
                .withBoundedContext(MyBoundedContext.configure()
                        .defineThenImplement()
                        .messagingAndStorage(messagingAndStorage)
                        .build())
                .build();
    
            context.start();
    
            return context;
        }
    }

Unlike [previous example](#run-your-bounded-context), ``SpringMongoDbStorage`` is used instead of the default
storage implementation.
