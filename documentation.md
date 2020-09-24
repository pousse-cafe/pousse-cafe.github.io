---
layout: page
title: Reference Guide
permalink: /doc/reference-guide/
---

## Table of Content

- [Introduction](#introduction)
- [Implementing domain processes](#implementing-domain-processes)
- [Definition and implementation](#definition-and-implementation)
- [Run your model](#run-your-model)
- [Introducing attributes](#introducing-attributes)
- [Implement aggregates](#implement-aggregates)
- [Message listeners](#message-listeners)
- [Implement messages](#implement-messages)
- [Implement services](#implement-services)
- [Test your model](#test-your-model)
- [Collision handling](#collision-handling)
- [More on attributes](#more-on-attributes)
- [Configuring services](#configuring-services)
- [Generating expert-readable documentation](#generating-expert-readable-documentation)
- [Spring integration](#spring-integration)
- [Storage plug-ins](#storage-plug-ins)
- [Messaging plug-ins](#messaging-plug-ins)


## Introduction

The purpose of Pousse-Café is to provide a framework enabling to

- efficiently write Java applications implementing complex business processes or workflows
- in a scalable way (from maintenance and performance points of view)
- with pluggable messaging and storage systems.

It comes with a DSL, the [Extended Messaging Intermediate Language (EMIL)](/doc/emil/),
enabling the simple description of domain processes. EMIL can be used to
[generate code](/doc/emil/#back-and-forth-between-emil-and-code)
 serving as a starting point of
the actual implementation. This accelerates the actual application design. Also, expert-readable documentation can
be automatically generated from the code, enabling an efficient communication with domain experts
(e.g. to get quick and precise feedback on the model itself).

The framework applies [Domain-Driven Design (DDD)](https://en.wikipedia.org/wiki/Domain-driven_design)'s 
concepts and principles to Java in providing an actual interpretation of them. With little effort, this enables
a scalable implementation.

Finally, Pousse-Café abstracts messaging and storage systems from model logic (i.e. the domain processes) in a way that 
enables to replace them without impacting the model code itself. Adding support for a new messaging or storage system boils 
down to implementing a couple of classes. Changing the storage or messaging system used by an application simply
consists in loading another implementation into the Pousse-Café runtime.


## Implementing domain processes

Below picture illustrates how Pousse-Café actually executes domain processes. It is followed by a textual summary of
what's represented in it.

<img src="/img/big_picture.svg">

- Pousse-Café provides a [runtime](#run-your-model) which "understands" DDD primitives;
- [Commands](#message-listeners) are submitted to the runtime;
- The runtime loads the [aggregates](#implement-aggregates) (or their factory or repository) defining
  [message listeners](#message-listeners) handling them;
- Aggregates (actually, their message listeners or [hooks](#aggregate-life-cycle-hooks)) issue
  [Domain events](#message-listeners) which are in turn handled by other message listeners;
- Aggregates and [services](#implement-services) are grouped in [Modules](#module);
- The set of message listeners executed following the submission of a command are part of a
  [domain process](#domain-processes);
- Domain events may cross modules borders enabling cross-module interactions.

The easiest way of implementing a domain process is probably to
- represent it using [EMIL](/doc/emil/),
- [generate some code](/doc/emil/#back-and-forth-between-emil-and-code) as a starting point and
- fill-in the gaps.

The purpose of this document is to describe *what* was actually generated and *how* the gaps must be filled.

## Definition and implementation

The pluggable storage and messaging systems feature of Pousse-Café is enabled by separating definition and
implementation:

- the attributes of an entity are *defined* using an interface,
- domain events and commands are *defined* using interfaces.

The classes actually *implementing* the interfaces contain the implementation details linked to the storage or messaging
system (friendly types, annotations, etc.).

Therefore, a model is *defined* by its component and the interfaces representing entity attributes, domain events and
commands. However, in order to be actually executable by the Pousse-Café runtime, the model must have an
implementation, it must be *implemented* as well.


## Run your model

A module is defined by interfaces or classes extending or implementing `poussecafe.domain.Module`.
The package of this class or interface defines the module's base package. Any component represented by a class
in a subpackage of the module's base package is considered as part of the module.

The definitions and implementations of aggregates and services of a given module are grouped in a Bundle.
A Bundle may include several Modules.

One or several Bundles may be instantiated in a Pousse-Café ``Runtime``. Upon creation, the 
runtime instantiates all required services and injects them when necessary. It also gives access to 
aggregates via their repository and factory.

The preferred way to create a Bundle is to use a ``BundleConfigurer``.

Below example illustrates the creation of a BundleConfigurer by automatically loading all domain components and 
implementations available in a module:

    public class MyBundle {
    
        private MyBundle() {
    
        }
    
        public static BundleConfigurer configure() {
            return new BundleConfigurer.Builder()
                    .module(MyModule.class)
                    .build();
        }
    }

If no module has been defined (i.e. all aggregates are in the default module), `DefaultModule` may be loaded.
However, this is not recommended because it implies the scanning of **all** classes in the classpath.

The BundleConfigurer uses the following annotations to discover the domain components to load:

- ``@Aggregate``
- ``@MessageImplementation``
- ``@DataAccessImplementation``
- ``@ServiceImplementation``
- ``@MessageListener``

In addition, sub-classes of the following interfaces/classes are automatically loaded as well:

- ``poussecafe.domain.Service``
- ``poussecafe.domain.DomainProcess``

The BundleConfigurer is used to instantiate a Bundle and provide it to a runtime which may, finally, be 
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

After that, commands may be submitted to the runtime using `submitCommand` and aggregates retrieved using their 
repository.

Repositories are automatically injected by the runtime in any registered service. For external services (i.e. non-domain
services), repositories may be retrieved from ``Runtime``'s ``Environment`` using the following methods:

- ``runtime.environment().repositoryOf(aggregateClass)`` where ``aggregateClass`` is the class of the 
aggregate root.

A [Spring integration](#spring-integration) exists enabling direct injection of domain component in Spring beans
and vice versa (up to some extent, see project page).

## Introducing Attributes

Before describing the actual implementation of an aggregate, the concept of Attribute should be introduced. 
Attributes are used in order to simplify the definition and implementation of entities, domain events and commands.
While their use is optional, it is highly recommended in order to simplify code and prevent
any accidental leak of technical details into domain logic.

An Attribute is an object encapsulating a value with a given type (the Attribute's type) and exposing a getter and
a setter for this value. It also hides the way the value is actually stored (you may for instance have a BigDecimal
Attribute actually storing its value in the form of a String). In that case, the implementation of the getter and
the setter includes the conversion logic.

Note that Attributes are similar to "properties" in Python and C#.

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
`OptionalAttribute<T>` (which extends `Attribute<Optional<T>>`, note however that using `OptionalAttribute` is
important as it enables some validity checks to be performed automatically by the runtime when testing your code
or when explicitly enabling the checks).

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


## Implement aggregates

The central element in Pousse-Café is the aggregate and its related services (i.e. the factory and the repository).


### Aggregate root

The aggregate root is implemented by a class extending `AggregateRoot<K, D>` where

- `K` is the type representing the identifier that
can be used to reference the aggregate and
- `D` is the type representing the data related to the aggregate.

`D` must implement the interface `EntityAttributes<K>` which defines an attribute for aggregate's ID.

`D` is the definition of aggregate root's attributes.

It is recommended to defined ``D`` as a static inner-class of the class defining the aggregate root. Indeed, domain
logic and data model are strongly linked.

Below example describes a Product aggregate root which has a single `availableUnits` attribute.

    @Aggregate(
        factory = ProductFactory.class,
        repository = ProductRepository.class,
        module = Shop.class
    )
    public class Product extends AggregateRoot<ProductId, Product.Attributes> {
        ...
    
        public static interface Attributes extends EntityAttributes<ProductId> {
            ...
    
            Attribute<Integer> availableUnits();
        }
    }

The ``@Aggregate`` annotation explicitly links the root entity with the aggregate's factory and repository.
It is required by [Pousse-Café's runtime](#run-your-model) in order to detect it.
`@Aggregate`'s `module` annotation links the aggregate to a given domain module.
The `module` attribute is optional, by default an aggregate is put in the default module.

The ``Product.Attributes`` interface defines the data model of an entity (and in particular, the aggregate root).
Each attribute is defined by a method
returning an instance of ``Attribute<V>`` where ``V`` is the type of the attribute.

The type of the value of an Attribute may be a primitive type, a value object (i.e. a class extending `ValueObject`)
or a collection of aforementioned types. Regular POJOs may be used as well but the Attributes of an entity should be as
much as possible expressed in terms of domain terms in order to prevent any leak of non-domain elements.

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

### Aggregate life-cycle hooks

There are 3 life-cycle hooks:

- `onAdd`
- `onUpdate`
- `onDelete`

The hooks are methods of `AggregageRoot` which may be overridden in order to modify the state of the aggregate
or issue one or several domain events (see [there](#in-an-aggregate-root)).

### Factory

In order to create aggregates, a factory is needed. A factory extends the `poussecafe.domain.Factory<K, A, D>`
class where

- `K` is the type of the aggregate's ID,
- `A` is the aggregate's type and
- `D` the type of aggregate's attributes definition.

The following example shows a
factory for the Product aggregate. It illustrates the creation of a Product with initially no available units given its
ID.

    public class ProductFactory extends Factory<ProductId, Product, Product.Data> {
    
        public Product buildProductWithNoStock(ProductId productId) {
            Product product = newAggregateWithId(productId);
            product.attributes().availableUnits().value(0);
            ...
            return product;
        }
    }

Note that while it is possible to create directly an aggregate using a factory and manually persist it, the preferred 
approach is to define a message listener and let the runtime [create and persist the new aggregate](#in-a-factory).


### Repository

Finally, aggregates need to be saved, updated or removed from storage. That's the purpose of the repository which is
implemented by extending the `Repository<A, K, D>` class where

- `A` is the aggregate's type,
- `K` is the type of the aggregate's ID and
- `D` the type of aggregate's attributes definition.

Repository's role is to

- wrap the data extracted from storage with aggregate roots when reading,
- unwrap the data to store into storage from aggregate roots when writing.

In order to do that, a repository uses an ``EntityDataAccess<K, D>`` where

- `K` is the type of the aggregate's ID and
- `D` the type of aggregate's attributes.

The actual implementation of ``EntityDataAccess<K, D>`` is dependent on the storage and has to be defined
when [configuring the Bundle](#run-your-model).

The `Repository` class defines the following default operations:

    A find(K id);
    A get(K id);
    void add(A aggregate);
    void update(A aggregate);
    void delete(K id);
    boolean existsById(K id);

where

- `find` returns an aggregate of null if none was found,
- `get` returns an aggregate or throws an exception if the aggregate was not found,
- `add` allows to add a new aggregate,
- `update` updates an existing aggregate,
- `delete` removes an aggregate from storage if it was present,
- `existsById` returns true if an aggregate is present in storage for given identifier, false otherwise.

The following example shows a repository for the Product aggregate.

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

The data access implementation defined for the repository must implement the interface. This implementation is
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
aggregate. ``storageName`` attribute is used when [instantiating a Pousse-Café runtime](#run-your-model).
Implementations not matching the chosen storage are ignored.


## Message listeners

There are 2 types of messages in Pousse-Café: domain events and commands. In DDD, one of the purposes of domain events
is eventual consistency. Commands represent inputs from users or external systems.

Messages are directly handled by domain components i.e. aggregate roots, factories or repositories.

The ``@MessageListener`` annotation is used to annotate a method that should handle a message. Such a method is called
a message listener. The annotation has 2 attributes that can be used in all situations:
- `processes` linking the listener to a set of processes (represented by an interface or class (extending or
  implementing `poussecafe.domain.Process`),
- `consumesFromExternal` names the external components or modules producing consumed message.

Both attributes are optional. By default, a message listener is linked to the default domain process 
(`poussecafe.discovery.DefaultProcess`) and consumes from no external component.

This information in above attributes is not used by the runtime. However, it enables:

- embedded documentation for developers, putting a given message listener in a context for the developer reading the code;
- the [generation of expert-readable documentation](#generating-expert-readable-documentation).

Message listener methods may also be annotated with `@ProducesEvent`. This annotation has 3 attributes:

- `value` is the produced domain event by mentioning the domain event definition interface,
- `required` tells if the issuance is required or not,
- `consumedByExternal` gives a list of external components consuming produced event.

Putting this annotation on the listener enables a check by the runtime that expected events are actually issued.
If it is not the case, the execution of the listener fails and an exception may be thrown in order to enable the
early detection of the issue. This is particularly interesting when [testing the model](#test-your-model).

It is also used to [generate model's expert-readable documentation](#generating-expert-readable-documentation).

### In a Factory

Factory message listeners are used to create aggregates when handling a domain event. There cannot be several listeners
per factory consuming the same message.

Below example illustrates listeners in a factory:

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

``createMyAggregate`` creates an aggregate each time an event ``Event1`` is consumed.

``optionallyCreateMyAggregate`` creates conditionally an aggregate when an event ``Event2`` is consumed. When
``Optional.empty()`` is returned, no aggregate is created.

``createMyAggregates`` creates zero, one or several aggregates each time an event ``Event3`` is consumed.

When new aggregates are created, Pousse-Café automatically starts a transaction and commits it if the storage requires
it when persisting the newly created aggregates. The creation itself i.e. the execution of the message listener
happens outside of the transaction (actually, before it).

The following algorithm describes how transactions are handled upon aggregate creation:

    while("all create listeners not executed") {
        "Execute create listener"; // Listener
        while("all created aggregates not persisted") {
            "Start transaction";
            "Add aggregate";
            "End transaction";
        }
    }


### In an aggregate root

Aggregate root message listeners are used to update aggregates when handling a domain event. Unlike factory listeners,
aggregate root listeners do not return a value, they only have side effects. There can not be several listeners per 
aggregate consuming the same message.

Below example describes a Product aggregate giving
the possibility to place an Order. The `OrderPlaced` event is issued if the order can be placed successfully.

    public class Product extends AggregateRoot<...> {
        ...
    
        @MessageListener(runner = PlaceOrderRunner.class, processes = OrderPlacement.class)
        @ProducesEvent(value = OrderRejected.class, required = false)
        @ProducesEvent(value = OrderPlaced.class, required = false)
        public void placeOrder(PlaceOrder command) {
            // Update aggregate state
    
            OrderPlaced event = newDomainEvent(OrderPlaced.class);
            // populate attributes of event
            issue(event);
        }
    
        ...
    }

The identity of the aggregates to update needs to be extracted from the message. Therefore, message listeners defined in
aggregate roots require a [runner](#runners) i.e. an instance of ``AggregateMessageListenerRunner<M, K, A>`` where

- ``M`` is the class of the consumed event,
- ``K`` is the class of aggregate's identifier (or any secondary identifier),
- ``A`` is the aggregate root's class.

Aggregate root's ``newDomainEvent`` method returns a new instance of [event implementation](#implement-messages).
Aggregate root's ``issue`` method queues the event for issuance after the aggregate update is successfully persisted.
Both methods may also be used within [hooks](#aggregate-life-cycle-hooks).

Below algorithm illustrates how an aggregate root listener and its runner are executed and how transactions are handled.

    "Compute aggregate identifiers to update"; // Runner
    while("all identifiers are not handled") {
        "Start transaction";
        "Fetch aggregate to update";
        if("message is expected") { // Runner
            "Execute update listener"; // Listener
            "Update aggregate;"
        }
        "End transaction";
    }

### Runners

The `runner` attribute of `MessageListener` enables to link a listener to its runner. This is only necessary for
aggregate root listeners.

A ``AggregateMessageListenerRunner`` is defined as follows:

    public interface AggregateMessageListenerRunner<M, K, A> {
    
        TargetAggregates<K> targetAggregates(M message);
    
        default Object context(M message, A aggregate) { return null; }
    
        default void validChronologyOrElseThrow(M message, A aggregate) {}
    }

``targetAggregates`` defines the IDs of the aggregates to update given an event. It also allows to define the
IDs of the aggregates whose creation is expected because they cannot be updated (see section about
[collision handling](#collision-handling)).

``context`` returns the data required to execute the update i.e. information coming potentially from other
aggregates or external configuration. The use of an update context is not recommended but may be required in some
cases. By default, no context is returned (i.e. `context` returns null).

`validChronologyOrElseThrow` checks if, based on an aggregate's state, the message is expected or not. This method
must throw one of the following exceptions if the message listener must not be executed and the aggregate must not
be updated:

- `SameOperationException` tells that the execution of the message listener must be skipped (e.g. because inspection
 of `aggregate`'s state tells that the message has already been handled),
- `RetryOperationException` tells that the execution of the message listener must be postponed (e.g. messages are 
expected in sequence and a gap was detected),
- `IllegalArgumentException` tells that given message is unexpected, an error is reported and listener execution
  skipped.

The exceptions listed above may be thrown by the message listener itself. However, this causes the business
logic inside of the listener to be crippled by technical concerns.

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

Repository message listeners are used to remove aggregates from storage. There cannot be several listeners per repository 
consuming the same message.

Below example illustrates a listener in a repository:

    public class MyAggregateRepository extends Repository<...> {
    
        @MessageListener
        public void deleteAggregate(Event3 event) {
            // Delete the aggregate
        }
    }

Below algorithm summarizes how a repository listener is executed and how transactions are handled.

    while("all delete listeners not executed") {
        "Start transaction";
        "Execute delete listener"; // Listener
        "End transaction";
    }

### In an Explicit domain process

Sometimes, defining message listeners at factory, aggregate root and repository level is not enough because it does not
enable the definition of more complex handling patterns. This is the purpose of *Explicit domain processes*.

An Explicit domain process is a non-domain service which contains message listeners.
It is defined by a class extending ``poussecafe.process.DomainProcess``.
An Explicit  domain process routes domain events or commands to an actual aggregate root, factory or repository,
potentially by first applying some custom processing.

Below example shows a very simple example of Explicit domain process.

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

The `runInTransaction` method runs the provided `Runnable` in the context of a transaction.

Note that above example is equivalent to defining the message listener in `MyAggregate` class and defining a runner
than returns a single ID equal to ``event.id().value()``.

In order to keep the code base as small and simple as possible, it is recommended to use explicit domain 
processes as a last resort. In other words, put as many message listeners in factories, aggregate roots and
repositories as possible. Explicit domain processes are kept for the very rare cases where this approach is not
possible.

### Custom message listeners

In some circumstances, for instance when you want to react to a domain event in a component that is not managed by
Pousse-Café's runtime (e.g. a Spring Bean), you may define
custom message listeners. Custom message listeners are defined in the same way as factory, repository and domain process
listeners (i.e. using the `@MessageListener` annotation). The only difference is that you have to register them 
explicitly.

This is done by using `runtime`'s `registerListenersOf` method:

    runtime.registerListenersOf(service)

where `service` is the instance of the service containing the listeners.


### Message listeners execution order

No assumption should be made on the order in which message listeners will be executed when handling a given message.
However, there are priority rules given the type of listener.
Below list shows the order in which listener types are executed:

1. Repository listeners
2. Aggregate listeners
3. Factory listeners
4. Domain process listeners
5. Custom listeners

So for example, if listeners of all types consume a message `M`, it will first be handled by listeners defined in 
repositories, then in listeners defined in aggregates, etc.

If several listeners are defined per type (e.g. repository listeners), the order in which they are executed is 
undefined.

There are several goals behind above priority rule:

- Define "update only" listeners in aggregates i.e. listeners that will not be executed on aggregates that were
previously created while handling the same message;
- Re-create an aggregate by removing it using a repository, then re-adding it with a factory;
- Prevent the removal by a repository of an aggregate previously created by a factory while handling the same message.


## Implement messages

Messages are defined by interfaces extending the `DomainEvent` or `Command` interface. The following example shows 
the definition of the `OrderPlaced` event.

    public interface OrderPlaced extends DomainEvent {
    
        Attribute<ProductId> productId();
    
        Attribute<OrderId> orderId();
    }

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
it suitable for Pousse-Café's internal messaging (``InternalMessaging``). This messaging's purpose is testing,
it should not be used in production.

Note that in above example, field names match Attribute names. This enables the runtime to check a message's
validity i.e. the fact that an `Attribute<T>` attribute has been set. Using an `OptionalAttribute<T>` type tells
the runtime that associated field may remain unset i.e. equal to `null`. Message validity check is an option of the 
runtime and is disabled by default but enabled [when running tests](#test-your-model). It can be enabled or disabled by
using `messageValidation(boolean)` method of `RuntimeBuilder` (see [how to create a runtime](#run-your-model)).

## Implement services

A service is defined by a Java class extending class ``Service`` with only the default constructor or an explicit
constructor taking no argument.

A service might depend on other domain services. Pousse-Café
provides a minimal dependency injection feature for the injection of domain services (including repositories and factories).

Below example illustrates the definition of a service:

    public class Service1 implements Service {
    
        public Object produceSomethingUsingService2(Object input) {
            // Use service2
        }
    
        private Service2 service2;
    }

When instantiating `Service1`, Pousse-Café will inject the instance of `Service2` at runtime (`Service2` being a
service as well).

In some cases, a service may be abstract because technical details need to be hidden in a specific implementation.
The `@ServiceImplementation` annotation can then be used to annotate the actual implementation and link it to
the abstract service using attribute `service`.

## Test your model

Pousse-Café provides tools allowing to easily test your model with no heavy storage setup required.
Actually, you might write your whole domain logic even before deciding what kind of
storage you would be using. More importantly, it means that you can focus your tests on the domain.

For testing, it is suggested to use the default in-memory storage implementation provided by Pousse-Café.
When actually integrating your Model in a real application, you could
then just choose another implementation [when building the runtime](#run-your-model).

`PousseCafeTest` class can be extended to write (e.g. JUnit) tests involving different Bundles.
What this class does is essentially instantiate a runtime and provide helpers to access its components.

Below example illustrates a test verifying that the handling of `CreateProduct` command actually implies the new
product to be available from the repository.

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
            assertTrue(orderRepository.existsById(productId));
        }
    
        private OrderRepository orderRepository;
    }

Overriding the `runtimeBuilder` method enables the configuration of test runtime.

``submitCommand`` directly submits the given command into the runtime for handling. `PousseCafeTest` also defines
`issue` method for direct issuance of domain events.

`orderRepository` is automatically set by `PousseCafeTest` which tells the runtime to inject domain components
in the test case instance.


### Initial state

Generally, when testing the handling of a command or domain event, you need an initial data set to be available (i.e.
an initial state for a collection of aggregates).

You may do this programmatically (by submitting a sequence of commands and/or domain events). However, this approach
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
aggregate root. The value of the fields is an array of objects, each object representing the data of linked aggregate.
The fields of the data objects depend on the implementation of an aggregate's data. For example, if you data 
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


### Testing a Single entity

Sometimes, one wants to only test a single method of an entity (i.e. not a whole process). In order to produce
such an entity, there are 2 possibilities:

1. use a factory,
2. produce a instance by hand.

First possibility might require some heavy setup in order to ensure that all constraints checked by the factory are met.
Therefore, in some cases, the second possibility is preferred. In order to prevent the manual configuration of such an 
entity (set data and other Pousse-Café implementation details), `PousseCafeTest` defines a `newEntity` method which 
produces an empty instance. One may then only set the required attributes and run its test against it.

### Behavior-Driven Development testing

`PousseCafeTest` exposes methods enabling to write tests following the given-when-then style defined by
[Behavior-Driven Development (BDD)](https://dannorth.net/introducing-bdd/).

- `given(X)` method is equivalent to `loadDataFile("/" + X + ".json")`,
- `when(X)` method is equivalent to `issue(X)` if `X` is a domain event or `submitCommand(X)` if `X` is a command.

This enables to write a test like this:

    @Test
    public void placingOrderOnAllUnitsEmptiesOrder() {
        given("productWith10UnitsAvailable");
        givenPlacingOrderForUnits(10);
        when(orderPlaced);
        thenOrderUnitsAvailable(0);
    }

## Collision Handling

Once you deploy your application in a distributed environment, you will more than likely want to achieve high performance
and/or high availability which may both be obtained by multiplying the number of processing nodes. In the context of
a Pousse-Café application, this generally means that you will have several Pousse-Café runtime instances executed by
different nodes running the same Modules and, therefore, the same sets of listeners.

The real issue is that you will start experiencing "collisions" i.e. several listeners trying to update or create the
same aggregate at the same time.

In a single node environment, even with several processing threads, Pousse-Café is able to prevent collisions. However,
in a multi-node environment, this is not possible.

Ideally, a model should be designed in a way that the probability of collision is reduced. Generally, this means
having many small aggregates instead of a few big ones. However, it is sometimes not possible to prevent them
completely (i.e. the probability of collision cannot be reduced to zero).

To handle this issue, Pousse-Café implements a rather simple mechanism: when a collision is detected while running a
listener, the execution of the listener is retried a bit later, potentially several times, until the listener is
successfully executed.

Note that this mechanism implies that messages may not be handled in a strict sequence anymore: a retry may cause
that a message that was sent before another one is actually handled after it. The Model has to be meant in a way
that supports this. If strict sequences are required, proper synchronization mechanisms have to be implemented.
Pousse-Café provides means to [skip or retry the execution of listeners](#message-listeners) in order to prevent 
inconsistencies.


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
returned by a runner (see [aggregate root listeners](#in-an-aggregate-root)). For example, the following code inside
of Runner's `targetAggregates` method tells to Pousse-Café that aggregate with ID `id` might be updated but if it
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

The creation itself must be handled by a [factory listener](#in-a-factory). Above logic is implemented by helpers
`UpdateOrCreateRunner` and `UpdateOrCreateOneRunner`. It is recommended to extend one of them when doing
"update or create" in a collision-prone environment.

Note that in a collision-free environment, the "else" block of above code is useless as creation will always be
executed in case no update was.


### Explicit domain processes and Custom Listeners

Currently, automated collision detection and handling is not available for explicit domain processes' listeners and
custom listeners. In those cases, collisions have to be handled explicitly by the developer.

## More on Attributes

Attributes [were introduced](#introducing-attributes) previously. This section describes the feature further.

### Auto-Adapters

Attributes can convert data using `DataAdapter<S, T>` instances (where `S` is the type of stored value and `T` the
type of the Attribute). When `S` is a "primitive" type (i.e. a type supported by persistence tool), this is the
preferred approach. When `S` and `T` are custom types (e.g. value objects), two classes have to be written:
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

Let's take the example of a value object:

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

Note that a data adapter can always be built from an auto-adapter by using factory method
`DataAdapters.auto(MyType.class, MyTypeAutoAdapter.class)` which returns an instance of
`DataAdapter<MyTypeAutoAdapter, MyType>`.

### Optional Attributes

Pousse-Café enforces the [null object pattern](https://en.wikipedia.org/wiki/Null_object_pattern): calling
`value` on an attribute instance and passing it a `null` value will throw an exception. Therefore, `value()` will never 
return `null` except initially before any value was actually set and the implementation does not provide a default value.

An attribute which may be undefined in the lifecycle of an entity should therefore be an `OptionalAttribute<T>` which 
actually extends `Attribute<Optional<T>>`.

Creating an optional attribute is done as follows:

    public OptionalAttribute<String> myAttribute() {
        return AttributeBuilder.optional(String.class)
                .read(() -> myAttribute)
                .write(value -> myAttribute = value)
                .build();
    }
    
    private String myAttribute;

When stored type does not match actual attribute type, there are 3 possible ways of converting data:

- Use a data adapter
- Use an [auto-adapter](#auto-adapters)
- Directly provide conversion functions

With a data adapter:

    public OptionalAttribute<MyType> myAttribute() {
        return AttributeBuilder.optional(MyType.class)
                .usingDataAdapter(MyTypeAdapter.instance())
                .read(() -> myAttribute)
                .write(value -> myAttribute = value)
                .build();
    }
    
    private StoredType myAttribute;

where `MyTypeAdapter` extends `DataAdapter<StoredType, MyType>`.

With an auto-adapter:

    public OptionalAttribute<MyType> myAttribute() {
        return AttributeBuilder.optional(MyType.class)
                .usingAutoAdapter(MyTypeAutoAdapter.class)
                .read(() -> myAttribute)
                .write(value -> myAttribute = value)
                .build();
    }
    
    private MyTypeAutoAdapter myAttribute;

With conversion functions:

    public OptionalAttribute<MyType> myAttribute() {
        return AttributeBuilder.optional(MyType.class)
                .storedAs(StoredType.class)
                .adaptOnRead(this::convertStoredTypeIntoMyType)
                .read(() -> myAttribute)
                .adaptOnWrite(this::convertMyTypeIntoStoredType)
                .write(value -> myAttribute = value)
                .build();
    }
    
    private StoredType myAttribute;

`convertStoredTypeIntoMyType` is an instance of `Function<StoredType, MyType>`
and `convertMyTypeIntoStoredType` is an instance of `Function<MyType, StoredType>`.


### Number Attributes

Number attributes extend `NumberAttribute<T>` and enable the in-place update of numbers using mathematical operators.

`NumberAttribute`'s builder requires an addition operator, Pousse-Café provides some common addition operators in
the `AddOperators` class. Here is a full example of building a `NumberAttribute<BigDecimal>` instance:

    public NumberAttribute<Integer> myAttribute() {
        return AttributeBuilder.number(Integer.class)
                .read(() -> myAttribute)
                .write(value -> myAttribute = value)
                .addOperator(AddOperators.INTEGER)
                .build();
    }
    
    private Integer myAttribute;

Given `r` references a `NumberAttribute<BigDecimal>` Attribute, then the following statement causes the value of `r` to
be incremented:

    r.add(BigDecimal.ONE)

which is equivalent to

    r.value(r.value().add(BigDecimal.ONE))

### List Attributes

List attributes extend `ListAttribute<T>` and enable direct modification of stored list by mutating the attribute
value.

    public ListAttribute<String> myAttribute() {
        return AttributeBuilder.list(String.class)
                .withList(myAttribute)
                .build();
    }
    
    private ArrayList<String> myAttribute = new ArrayList<>();

Note that `myAttribute` has to be initialized (i.e. it cannot be `null`).

With above list attribute, the execution of

    myAttribute().value().add("test")

adds `"test"` to `myAttribute` list.

When the type of storage list elements does not match the type of attribute list, there are 3 possible ways of
converting data:

- Use a data adapter
- Use an [auto-adapter](#auto-adapters)
- Directly provide conversion functions

With a data adapter:

    public ListAttribute<MyType> myAttribute() {
        return AttributeBuilder.list(MyType.class)
                .usingItemDataAdapter(MyTypeAdapter.instance())
                .withList(myAttribute)
                .build();
    }
    
    private ArrayList<StoredType> myAttribute = new ArrayList<>();

where `MyTypeAdapter` extends `DataAdapter<StoredType, MyType>`.

With an auto-adapter:

    public ListAttribute<MyType> myAttribute() {
        return AttributeBuilder.list(MyType.class)
                .usingAutoAdapter(MyTypeAutoAdapter.class)
                .withList(myAttribute)
                .build();
    }
    
    private ArrayList<MyTypeAutoAdapter> myAttribute = new ArrayList<>();

With conversion functions:

    public ListAttribute<MyType> myAttribute() {
        return AttributeBuilder.list(MyType.class)
                .itemsStoredAs(StoredType.class)
                .adaptOnGet(this::convertStoredTypeIntoMyType)
                .adaptOnSet(this::convertMyTypeIntoStoredType)
                .withList(myAttribute)
                .build();
    }
    
    private ArrayList<MyTypeAutoAdapter> myAttribute = new ArrayList<>();

`convertStoredTypeIntoMyType` is an instance of `Function<StoredType, MyType>`
and `convertMyTypeIntoStoredType` is an instance of `Function<MyType, StoredType>`.

### Map Attributes

Map attributes extend `MapAttribute<K, V>` and enable direct modification of stored map by mutating the attribute
value.

    public MapAttribute<Integer, String> myAttribute() {
        return AttributeBuilder.map(Integer.class, String.class)
                .withMap(myAttribute)
                .build();
    }
    
    private HashMap<Integer, String> myAttribute = new HashMap<>();

Note that `myAttribute` has to be initialized (i.e. it cannot be `null`).

With above map attribute, the execution of

    myAttribute().value().put(1, "test")

adds entry `(1, "test")` to `myAttribute` map.

When the type of storage map entries (key and/or value type(s)) does not match the type of attribute map entries, there are 
2 possible ways of converting data:

- Use data adapters
- Directly provide conversion functions

With data adapters:

    public MapAttribute<MyKeyType, MyValueType> myAttribute() {
        return AttributeBuilder.map(MyKeyType.class, MyValueType.class)
                .usingEntryDataAdapters(
                    MyKeyTypeAdapter.instance(),
                    MyValueTypeAdapter.instance())
                .withMap(myAttribute)
                .build();
    }
    
    private HashMap<MyStoredKeyType, MyStoredValueType> myAttribute = new HashMap<>();

where
- `MyKeyTypeAdapter` extends `DataAdapter<MyStoredKeyType, MyKeyType>` and
- `MyValueTypeAdapter` extends `DataAdapter<MyStoredValueType, MyValueType>`.

With conversion functions:

    public MapAttribute<MyKeyType, MyValueType> myAttribute() {
        return AttributeBuilder.map(MyKeyType.class, MyValueType.class)
                .entriesStoredAs(MyStoredKeyType.class, MyStoredValueType.class)
                .adaptOnRead(this::convertMyStoredKeyTypeIntoMyKeyType,
                    this::convertMyStoredValueTypeIntoMyValueType)
                .adaptOnWrite(this::convertMyKeyTypeIntoMyStoredKeyType,
                    this::convertMyValueTypeIntoMyStoredValueType)
                .withMap(myAttribute)
                .build();
    }
    
    private HashMap<MyStoredKeyType, MyStoredValueType> myAttribute = new HashMap<>();

- `convertMyStoredKeyTypeIntoMyKeyType` is an instance of `Function<MyStoredKeyType, MyKeyType>`
- `convertMyStoredValueTypeIntoMyValueType` is an instance of `Function<MyStoredValueType, MyValueType>`
- `convertMyKeyTypeIntoMyStoredKeyType` is an instance of `Function<MyValueType, MyStoredValueType>`
- `convertMyValueTypeIntoMyStoredValueType` is an instance of `Function<MyValueType, MyStoredValueType>`

From the above, it may seem that auto-adapters cannot be used with map attributes. It is not the case as an data adapter
can always be built from an auto-adapter (see [this section](#auto-adapters)).

Maps may be backed by regular collections (like a list). This may be required by some storage technologies or just more
convenient in terms of data schema. There are 2 cases:

- either the values of the attribute map (not the stored one) contain the key
- either they do not.

In the first case, the preferred approach is to convert the elements of stored collection, then extract the key.
Such a map attribute is built as follows:

    public MapAttribute<Integer, String> myAttribute() {
        return AttributeBuilder.map(MyKeyType.class, MyValueType.class)
                .usingItemDataAdapter(MyValueTypeAdapter.instance())
                .withKeyExtractor(MyValueType::getKey)
                .withCollection(myAttribute)
                .build();
    }
    
    private ArrayList<MyStoredValueType> myAttribute = new HashMap<>();

where `MyValueType` is able to compute its key and this key can be obtained by calling instance method `getKey()`.

If above condition is not met, then an entry data adapter should be used:

    public MapAttribute<Integer, String> myAttribute() {
        return AttributeBuilder.map(MyKeyType.class, MyValueType.class)
                .usingEntryDataAdapter(MyValueTypeEntryAdapter.instance())
                .withCollection(myAttribute)
                .build();
    }
    
    private ArrayList<MyStoredValueType> myAttribute = new HashMap<>();

where `MyStoredValueType` directly or indirectly contains the key which is computed by `MyValueTypeEntryAdapter`.
`MyValueTypeEntryAdapter` extends `DataAdapter<MyStoredValueType, Entry<MyKeyType, MyValueType>>`.


### Set Attributes

Set attributes extend `SetAttribute<T>` and enable direct modification of stored set by mutating the attribute
value.

    public SetAttribute<String> myAttribute() {
        return AttributeBuilder.set(String.class)
                .withSet(myAttribute)
                .build();
    }
    
    private HashSet<String> myAttribute = new HashSet<>();

Note that `myAttribute` has to be initialized (i.e. it cannot be `null`).

With above set attribute, the execution of

    myAttribute().value().add("test")

adds `"test"` to `myAttribute` set.

When the type of storage set elements does not match the type of attribute set, there are 3 possible ways of
converting data:

- Use a data adapter
- Use an [auto-adapter](#auto-adapters)
- Directly provide conversion functions

With a data adapter:

    public SetAttribute<MyType> myAttribute() {
        return AttributeBuilder.set(MyType.class)
                .usingItemDataAdapter(MyTypeAdapter.instance())
                .withSet(myAttribute)
                .build();
    }
    
    private HashSet<StoredType> myAttribute = new HashSet<>();

where `MyTypeAdapter` extends `DataAdapter<StoredType, MyType>`.

With an auto-adapter:

    public ListAttribute<MyType> myAttribute() {
        return AttributeBuilder.set(MyType.class)
                .usingAutoAdapter(MyTypeAutoAdapter.class)
                .withSet(myAttribute)
                .build();
    }
    
    private HashSet<MyTypeAutoAdapter> myAttribute = new HashSet<>();

With conversion functions:

    public ListAttribute<MyType> myAttribute() {
        return AttributeBuilder.set(MyType.class)
                .itemsStoredAs(StoredType.class)
                .adaptOnGet(this::convertStoredTypeIntoMyType)
                .adaptOnSet(this::convertMyTypeIntoStoredType)
                .withSet(myAttribute)
                .build();
    }
    
    private HashSet<MyTypeAutoAdapter> myAttribute = new HashSet<>();

`convertStoredTypeIntoMyType` is an instance of `Function<StoredType, MyType>`
and `convertMyTypeIntoStoredType` is an instance of `Function<MyType, StoredType>`.

### Common Data Adapters

The class `poussecafe.attribute.adapters.DataAdapters` contains a collection of factory methods instantiating
common data adapters.

### Entity attributes

Entity attributes enable the implementation of one-to-one and one-to-many relations between entities. Many-to-many
relations are implemented using an additional aggregate acting as the relation between other aggregates.

Entity attributes i.e. Attributes whose type is a sub-class of `poussecafe.domain.Entity` require a different
approach because:

- altering individual Attributes of an entity has to update immediately the data (i.e. the value returned by an entity
Attribute is mutable, which should generally not be the case),
- domain events issued while interacting with an entity are queued at the aggregate level.

Therefore, there is a need for a specific attribute class `EntityAttribute<E extends Entity>`.

The following snippet illustrates how to set the value of an entity Attribute:

    var newEntity = newEntityBuilder(MyEntity.class).withId(someId).build();
    // Set newEntity attributes and/or call its methods here
    attributes().entity().value(newEntity);

The `OptionalEntityAttribute` is similar to `EntityAttribute` but supports the case where no entity is available.

Both `EntityAttribute` and `OptionalEntityAttribute` implement a one-to-one relation.

`EntityMapAttribute` enables the implementation of one-to-many relations. It extends
`MapAttribute<K, E extends Entity<K, ?>`.

The following snippet illustrates how to put a new entity in the Entities map:

    var newEntity = newEntityBuilder(MyEntity.class).withId(someId).build();
    // Set newEntity attributes and/or call its methods here
    map.putEntity(newEntity);


## Configuring services

Sometimes, services need some external configuration (e.g. a URL to inject into a text). When [instantiating
the runtime](#run-you-model), configuration entries may be added with runtime Builder's `withConfiguration` methods.
runtime's `poussecafe.runtime.Configuration` instance can be injected in a service, giving access to
configuration entries.

For example, let's have a runtime created as follows:

    new Runtime.Builder()
        ...
        .withConfiguration("X", "Y")
        ...
        .build();

Given a service defined as follows:

    public class MyService implements Service {
    
        public String processConfiguration() {
            return "Prefix " + configuration.value("X").orElseThrow();
        }
    
        private Configuration configuration;
    }

Then, the value returned when calling `MyService`'s `processConfiguration` method is `Prefix Y`.

When using Pousse-Café [in the context of a Spring application](#spring-integration), configuration entries may be
read from application properties.


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

A module is defined by interfaces or classes extending or implementing `poussecafe.domain.Module`.

The name of the module is the name of module's class.

The javadoc comment's body is used as the description of the module. HTML tags may be used for formatting.

`@short` tag defines the short (i.e. one sentence) description of the module. The short description is used
in the Ubiquitous Language section of the documentation.

Example:

    /**
     * <p>Formatted description of a <em>Module</em>.</p>
     * 
     * @short Short description of the Module.
     */

### Module Components

Each module Component (aggregate, entity, value object, service and domain process) is described in the javadoc comment
on its class (i.e. a class extending respectively `AggregateRoot`, `value object`, `ValueObject`, `Service` or
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

`@trivial` tag used at class level tells that there is no need for a description (e.g. a value object named
MyAggregateId is obviously the identifier of aggregate MyAggregate).

Above components must be part of a module. The aggregate is attached to a module through the `module` of
`@AggregateRoot`. The other components are attached to a module using the `@Module` annotation, its value being
a module class. The package of the component class must be compatible with the module package: it must be the same as
or a sub-package of the module definition classes package (i.e. if a module class is in package `x.y.z`, then domain
process class must be in package `x.y.z` or in a sub-package).


### Domain processes

A domain process is essentially described by a directed graph where:

- nodes represent the *steps* of the process i.e. the executed message listeners;
- edges represent a domain event being issued by a source node (i.e. in the context of the execution of a Message 
  Listener) and handled by a destination node (i.e. another message listener).

Pousse-Café Doc is able to automatically discover the steps of a domain process by analyzing all defined message 
listeners. It uses `@MessageListener` and `@ProducesEvent` annotations to do so.

The name of the domain process is the name of a class extending `poussecafe.domain.Process`.

The description of the domain process is given by javadoc comment's body. HTML tags may be used for formatting.

`@Module` annotation can be used to explicitly bind a domain process to a module. The package of the domain process
class must be compatible with the module package: it must be the same as or a sub-package of the module definition
classes package (i.e. if a module class is in package `x.y.z`, then domain process class must be in package `x.y.z`
or in a sub-package).

Furthermore, "virtual nodes" may be added to the graph to illustrate the fact that some events are coming from or going 
to non-domain components (in case of integration with an external system) or other Modules.

This is controlled by
- `@MessageListener`'s `consumesFromExternal` attribute which contains a list of names
identifying the non-domain components or Modules producing the message consumed by the message listener;
- `@ProducesEvent`'s `consumedByExternal` attribute which contains a list of names
identifying the non-domain components or Modules consuming the message produced by the message listener;

## Spring Integration

Instantiating a Pousse-Café runtime inside of a Spring application is easy thanks to Pousse-Café's
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
