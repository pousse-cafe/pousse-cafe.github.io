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
- [Implement messages](#implement-messages)
- [Implement aggregates](#implement-aggregates)
- [Message listeners](#message-listeners)
- [Implement services](#implement-services)
- [Test your model](#test-your-model)
- [Collision handling](#collision-handling)
- [Configuring services](#configuring-services)
- [Generating expert-readable documentation](#generating-expert-readable-documentation)
- [More on attributes](#more-on-attributes)
- [Spring integration](#spring-integration)
- [Storage plug-ins](#storage-plug-ins)
- [Messaging plug-ins](#messaging-plug-ins)


## Introduction

The purpose of Pousse-Café is to provide a framework enabling to

- efficiently write Java applications implementing complex business processes or workflows
- in a scalable way (from maintenance and performance points of view)
- with pluggable messaging and storage systems (because they are implementation details, process implementation should be independent of them).

It comes with a DSL, the [Extended Messaging Intermediate Language (EMIL)](/doc/emil/),
enabling the simple description of domain processes which enables a higher level preview of how the process is
structured and how lower level components interact. EMIL can be used to
[generate code](/doc/emil/#back-and-forth-between-emil-and-code)
 serving as a starting point or augmenting
the actual implementation.

Expert-readable documentation can
be automatically [generated from the code](#generating-expert-readable-documentation),
enabling an efficient communication with domain experts
(e.g. to get quick and precise feedback on the model itself).

The framework applies [Domain-Driven Design (DDD)](https://en.wikipedia.org/wiki/Domain-driven_design)'s 
concepts and principles to Java in providing an actual interpretation of them. With little effort, this enables
a scalable implementation.

Finally, Pousse-Café separates messaging and storage systems from model logic (i.e. the domain processes) in a way that 
enables to replace them without impacting the model code itself. Changing the storage or messaging system used by an 
application simply consists in loading another implementation into the Pousse-Café runtime. Also, adding support for a new 
messaging or storage system boils down to implementing a couple of classes. 

In the following, below names represent DDD concepts unless explicitly stated:

- domain
- aggregate
- factory
- repository
- domain event (or event)
- service
- module
- entity
- value object

While the remainder of this document is probably legible without prior knowledge of DDD, the understanding of
above concepts will definitely help in getting *why* the framework is organized the way it is and *how* this actually
enables scalable business process implementations.


## Implementing domain processes

Below picture illustrates how Pousse-Café actually executes domain processes.

<img src="/img/big_picture.svg">

- Pousse-Café provides a [runtime](#run-your-model) which "understands" DDD primitives;
- [Commands](#message-listeners) are submitted to the runtime;
- The runtime loads the [aggregates](#implement-aggregates) (or their factory or repository) defining
  [message listeners](#message-listeners) handling them;
- Aggregates (actually, their message listeners or [hooks](#aggregate-root)) issue
  [Domain events](#message-listeners) which are in turn handled by other message listeners;
- Aggregates and [services](#implement-services) are grouped into [Modules](#module);
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
- the queries for fetching aggregate root data are *defined* using an interface,
- domain events and commands are *defined* using interfaces.

The classes actually *implementing* the interfaces contain the implementation details linked to the storage or messaging
system (friendly types, annotations, etc.).

Therefore, a model is *defined* by its component and the interfaces representing entity attributes, queries,
domain events and
commands. However, in order to be actually executable by the Pousse-Café runtime, the model must also have an
implementation, it must be *implemented*.


## Run your model

A module is defined by interfaces or classes extending or implementing `poussecafe.domain.Module`.
The package of this class or interface defines the module's base package. Any component represented by a class
in a sub-package of the module's base package, or the base package itself, is considered as part of the module.

The following components are grouped into modules:

- aggregate
- factory
- repository
- domain event (or event)
- service
- entity
- value object

At code level, a module contains both the definition and the implementation i.e. implementation classes must be included
in a sub-package of module's base package.

Definitions and implementations of a set of modules are grouped into a Bundle. A Bundle links a set of modules to a
given storage and messaging. The preferred way to create a Bundle is to use a ``BundleConfigurer``.

Below example illustrates the creation of a BundleConfigurer by automatically loading all domain components and 
implementations available in a module:

    public class MyBundle {
    
        public static BundleConfigurer configure() {
            return new BundleConfigurer.Builder()
                    .module(MyModule.class)
                    .build();
        }
        
        private MyBundle() {
    
        }
    }

<p class="alert alert-warning">
If no module has been defined (i.e. all aggregates are in the default module), <code>DefaultModule</code>
may be loaded. However, this is not recommended because it implies the scanning of <strong>all</strong>
classes in the classpath.
</p>

`BundleConfigurer` uses the following annotations to discover the domain components to load:

- ``@Aggregate``
- ``@MessageImplementation``
- ``@DataAccessImplementation``
- ``@ServiceImplementation``
- ``@MessageListener``

In addition, sub-classes of the following interfaces/classes are automatically loaded as well:

- ``poussecafe.domain.Service``
- ``poussecafe.domain.DomainProcess``

`BundleConfigurer` is used to instantiate a Bundle and provide it to a runtime which may, finally, be 
started:

    Bundle bundle = MyBundle.configure()
        .defineAndImplementDefault()
        .build();
    Runtime runtime = new Runtime.Builder()
        .withBundle(bundle)
        .build();
    runtime.start();

``defineAndImplementDefault`` method returns a Bundle builder that will select internal storage and messaging
implementations. In order to use another storage and messaging, use `defineThenImplement`.

<p class="alert alert-info">
Several bundles may be loaded into a runtime. As a consequence, it is possible to combine different storage and
messaging technologies in the same application. This may be useful in situations like integration with legacy systems
or optimization (when parts of the model are better suited to another storage technology).
</p>

Upon creation, the runtime instantiates all required services and injects them. All domain services (including aggregate
factories and repositories) are singletons.
Any domain service may have a field which type is another domain service.
A call to ``Runtime``'s ``start`` method actually starts the consumption of messages by listeners. The call to
`start` is non blocking.

After that, commands may be submitted to the runtime using `Runtime.submitCommand` and aggregates retrieved using their 
repository.

Domain events should be issued by aggregates upon state transitions.
However, in some cases (e.g. when integrating with an external system),
it might be necessary to directly submit an event to the runtime. This is the purpose of `Runtime.issue` method.

For external services (i.e. non-domain services), repositories may be retrieved from ``Runtime``'s ``Environment``
using the following methods:

    runtime.environment().repositoryOf(aggregateClass)

where ``aggregateClass`` is the class of the aggregate root.

Another possibility for accessing a repository is to inject it manually into a service:

    runtime.injector().injectDependenciesInto(service)

where `service` is an instance into which Pousse-Café services should be injected. If `service`'s 
class contains a field which type is a repository, it will be injected.

<p class="alert alert-info">
A <a href="#spring-integration">Spring integration</a> exists enabling direct injection of domain component in
Spring beans and vice versa (up to some extent, see the
<a href="https://www.github.com/pousse-cafe/pousse-cafe-spring">project page</a> for more details).
</p>


## Introducing Attributes

Before describing how to define and implement domain events, commands or aggregates, the concept of *attribute* must be 
introduced. The purpose of attributes is the simplification of the definition and implementation of entities, domain events and
commands. While their use is optional, it is highly recommended in order to make the code more readable and prevent
accidental leaks of technical details into the model.

An Attribute is an object encapsulating a value and exposing a getter and
a setter for this value. It hides the way the value is actually represented: you may for instance have a BigDecimal
attribute with its value actually stored in the form of a String. In that case, the implementation of the getter and
the setter includes the conversion logic.

<p class="alert alert-info">
Attributes are similar to (but more powerful than) "properties" in Python and C#.
</p>

The purpose of attributes is

1. to simplify the interface of an enclosing class: instead of having 2 methods (one for the getter, one for the setter),
a single method exposing the attribute is enough,
2. to simplify client code when data conversion is needed (i.e. when the type of stored value is different from the type 
exposed),
3. to have an interface explicitly exposing an attribute in the form of a single element (and not two with getter and
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

Given a reference `r` to an instance of `Example`, setting `x` is written as follows:

    r.x().value(new BigDecimal("42"))

Getting the value of `x` is written as follows:

    r.x().value()

One could directly implement `Attribute` interface, but Pousse-Café provides an `AttributeBuilder` easing the
task and preventing the explicit use of anonymous classes which would cripple the code.

An implementation of `Example` looks like this:

    class ExampleImpl implements Example {
    
        public Attribute<BigDecimal> x() {
            return AttributeBuilder.single(BigDecimal.class)
                .read(() -> x)
                .write(value -> x = value)
                .build();
        }
        
        private BigDecimal x;
    }

In above example, `AttributeBuilder.single` returns an Attribute which expects a non-null value. If the value can be
null, use `AttributeBuilder.optional` and make this explicit in your interface by exposing an
`OptionalAttribute<T>` (which extends `Attribute<Optional<T>>`).

<p class="alert alert-warning">
Using <code>OptionalAttribute&lt;T&gt;</code> (instead of <code>Attribute&lt;Optional&lt;T&gt;&gt;</code>) is
important as it enables some validity checks to be performed automatically by the runtime when testing your code
or when explicitly enabling the checks in the runtime.
</p>

Let's now imagine that we need to persist instances of `Example`. Let's also imagine that the persistence tool
we are using is able to persist the private fields of an object but does not support BigDecimal type. We still want
`Example` to expose a BigDecimal Attribute but we need to store it using another type (e.g. String). Another possible 
implementation of `Example` is then the following:

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
`DataAdapter<S, T>`, where `S` is the type of stored value and `T` the type of the value to store, is an interface
defining two methods, `T adaptGet(S)` and `S adaptSet(T)`, respectively
converting the stored value and the value to store. One can directly implement its own implementation of
`DataAdapter` and provide it to
`usingDataAdapter` but Pousse-Café already comes with a couple of [common ones](#common-data-adapters) defined in
`DataAdapters`.

This last approach enables the writing of code that interacts with an abstraction `Example` independently of persistence
details (persisted type, conversion, etc.) which illustrates the second purpose of Attributes described at the beginning
of this section.

<p class="alert alert-info">
More information about attributes can be found in <a href="#more-on-attributes">this section</a>.
</p>


## Implement messages

In order to submit a command to the runtime, it first needs to be defined and implemented.

A message is defined by an interface extending the `DomainEvent` or `Command` interface. The following example shows 
the definition of the `PlaceOrder` command (the approach is strictly similar for domain events, the definition just
extends `DomainEvent` instead of `Command`).

    public interface PlaceOrder extends Command {
    
        Attribute<ProductId> productId();
    
        Attribute<Integer> units();
    }

Below example illustrates the implementation of above command:

    @MessageImplementation(message = PlaceOrder.class)
    @SuppressWarnings("serial")
    public class PlaceOrderData implements Serializable, PlaceOrder {
    
        @Override
        public Attribute<ProductId> productId() {
            return AttributeBuilder.stringId(ProductId.class)
                .read(() -> productId)
                .write(value -> productId = value)
                .build();
        }
    
        private String productId;
    
        @Override
        public Attribute<Integer> units() {
            return AttributeBuilder.simple(OrderDescription.class)
                .read(() -> units)
                .write(value -> units = value)
                .build();
        }
    
        private int units;
    }

The ``@MessageImplementation`` annotation links the implementation to a definition.
Above implementation is serializable which makes
it suitable for Pousse-Café's internal messaging (``InternalMessaging``).

<p class="alert alert-warning">
<code>InternalMessaging</code>'s purpose is testing, it should not be used in production.
</p>

Note that in above example, field names match Attribute names. This enables the runtime to check a message's
validity i.e. the fact that an `Attribute<T>` attribute has been set. Using an `OptionalAttribute<T>` type tells
the runtime that associated field may remain unset i.e. equal to `null`. Message validity check is an option of the 
runtime and is disabled by default but enabled [when running tests](#test-your-model). It can be enabled or disabled by
using `messageValidation(boolean)` method of `RuntimeBuilder` (see [how to create a runtime](#run-your-model)).

Once the command is defined, implemented and loaded into the runtime, an instance may be submitted as follows:

    var command = runtime.newCommand(PlaceOrder.class);
    // Set attribute values
    runtime.submitCommand(command);

<p class="alert alert-warning">
The command will be <a href="#message-listeners">asynchronously handled</a>.
</p>


## Implement aggregates

A central element of Pousse-Café is the aggregate and its related services (i.e. the factory and the repository).
They actually contain the code [handling messages](#message-listeners) and updating persisted state. Indeed, the
purpose of executing a domain process is to update the persisted state while making sure the some constraints are met.

### Aggregate container

An aggregate is defined by a container class which will contain the definition of the root, factory and repository.
They will be represented as static inner-classes of the container class. The container class simple name is the name
of the aggregate. This name must be unique inside of the [enclosing module](#run-your-model).

Below example gives an example of container class for an aggregate called Product:

    @Aggregate
    public class Product {
        
        public static class Root ... {
            ...
        }
        
        public static class Factory ... {
            ...
        }
        
        public static class Repository ... {
            ...
        }
    }

The ``@Aggregate`` annotation marks the container class as an aggregate definition.
It is required for the class [to be detected](#run-your-model).

The following sections describe the inner classes of the aggregate container class.


### Aggregate root

The aggregate root is defined by a class extending `AggregateRoot<K, D>` where

- `K` is the type representing the identifier that
can be used to reference the aggregate and
- `D` is the type representing the data related to the aggregate.

`D` must implement the interface `EntityAttributes<K>` which defines an attribute for aggregate's ID.

`D` is the definition of aggregate root's attributes.

It is recommended to defined ``D`` as a static inner-class of the class defining the aggregate root. Indeed, domain
logic and data model are tightly coupled.

Below example describes a Product aggregate root which has a single `availableUnits` attribute.

    @Aggregate
    public class Product {
        ...

        public static class Root extends AggregateRoot<ProductId, Root.Attributes> {
            ...
        
            public static interface Attributes extends EntityAttributes<ProductId> {
                
                Attribute<Integer> availableUnits();
            }
        }
        
        ...
    }

The ``Product.Attributes`` interface defines the data model of an entity (and in particular, the aggregate root).
Each attribute is defined by a method
returning an instance of ``Attribute<V>`` where ``V`` is the type of the attribute.

The type of the value of an attribute may be
- a "basic" type (e.g. `Integer`, `String`, etc.),
- a value object (i.e. a class implementing `poussecafe.domain.ValueObject` interface),
- an entity (i.e. a class extending `poussecafe.domain.Entity`, see [entity attributes](#entity-attributes) for more information) or
- a collection of aforementioned types.

Regular POJOs may be used as well, but the attributes of an entity should be
expressed as much as possible in terms of domain concepts so that the model remains understandable by domain experts.

Below example illustrates an implementation of ``Product.Root.Attributes`` interface.

    @SuppressWarnings("serial")
    public class ProductAttributes implements Product.Root.Attributes, Serializable {
    
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
    }

This implementation is serializable and is therefore suitable, for example, for Pousse-Café's internal memory-based
storage (``InternalStorage``). [Other storage types](#storage-plug-ins) might require additional enrichment of
the data (annotations, etc.).

<p class="alert alert-warning">
Pousse-Café's internal storage's purpose is testing, it should not be used in production.
</p>

Aggregate roots have 3 life-cycle hooks:

- `onAdd`: called before a new (i.e. created by a factory and not yet added to the storage) aggregate is inserted
into the storage
- `onUpdate`: called before an existing (i.e. fetched using a repository) aggregate is updated in the storage
- `onDelete`: called before an existing aggregate is removed from storage

The hooks are methods of `AggregageRoot` which may be overridden in order to modify the state of the aggregate
or issue one or several domain events (see [here](#aggregate-root-listeners)).

### Factory

In order to create aggregates, a factory is needed. A factory extends the `poussecafe.domain.Factory<K, A, D>`
class where

- `K` is the type of the aggregate's ID,
- `A` is the aggregate's type and
- `D` the type of aggregate's attributes definition.

There is one factory per aggregate type.

The following example shows a
factory for the Product aggregate. It illustrates the creation of a Product with initially no available units given its
ID.

    @Aggregate
    public class Product {
        ...
        
        public static class Factory extends AggregateFactory<ProductId, Root, Root.Attributes> {
        
            public Product buildProductWithNoStock(ProductId productId) {
                Product product = newAggregateWithId(productId);
                product.attributes().availableUnits().value(0);
                ...
                return product;
            }
        }
        
        ...
    }

<p class="alert alert-warning">
While it is possible to create directly an aggregate using a factory and manually persist it,
as above example suggests,
the preferred approach for doing this is to use a <a href="#factory-listeners">message listener</a>.
</p>

### Repository

Finally, aggregates need to be saved, updated or removed from storage. That's the purpose of the repository which is
implemented by extending the `poussecafe.domain.AggregateRepository<K, A, D>` class where

- `K` is the type of the aggregate's ID and
- `A` is the aggregate's type,
- `D` the type of aggregate's attributes definition.

The repository's role is to

- wrap the data extracted from storage with aggregate roots when reading,
- unwrap the data to store into storage from aggregate roots when writing,
- define queries,
- delete aggregates.

In order to do that, a repository uses an ``EntityDataAccess<K, D>`` instance where

- `K` is the type of the aggregate's ID and
- `D` the type of aggregate's attributes.

The actual implementation of ``EntityDataAccess<K, D>`` is dependent on the storage and has to be
[loaded into the runtime](#run-your-model).

The `Repository` class defines the following default operations:

    Optional<A> getOptional(K id);
    A get(K id);
    void add(A aggregate);
    void update(A aggregate);
    void delete(K id);
    boolean existsById(K id);

where

- `getOptional` returns an optional aggregate (empty if no aggregate with given identifier was found),
- `get` is equivalent to `getOptional(id).orElseThrow(() -> new NotFoundException(...))`,
- `add` adds a new aggregate (throws an exception if an aggregate with same identifier already exists),
- `update` updates an existing aggregate,
- `delete` removes an aggregate from storage (if it was present),
- `existsById` returns true if an aggregate is present in storage for given identifier, false otherwise.

The following example shows a repository for the Product aggregate.

    @Aggregate
    public class Product {
        ...

        public static class Repository extends AggregateRepository<ProductId, Product, Product.Attributes> {
        
            public List<Product> findByAvailableUnits(int availableUnits) {
                return wrap(dataAccess().findByAvailableUnits(availableUnits));
            }
        
            @Override
            public DataAccess<Product.Attributes> dataAccess() {
                return (DataAccess<Product.Attributes>) super.dataAccess();
            }
            
            public static interface DataAccess<D extends EntityAttributes> extends EntityDataAccess<ProductId, D> {
    
                List<D> findByAvailableUnits(int availableUnits);
            }
        }

        ...
    }

In above example, the additional query method ``findByAvailableUnits`` is defined. The `DataAccess` static inner
interface defines the queries needed on data. `EntityDataAccess` interface defines the default ones.

The data access implementation defined for the repository must implement its data access interface.

This is an example of implementation:

    @DataAccessImplementation(
        aggregateRoot = Product.Root.class,
        dataImplementation = ProductAttributes.class,
        storageName = InternalStorage.NAME
    )
    public class ProductDataAccess extends InternalDataAccess<ProductId, ProductAttributes>
    implements Product.Repository.DataAccess<ProductAttributes> {
    
        public List<ProductData> findByAvailableUnits(int availableUnits) {
            return findAll().stream()
                .filter(data -> data.availableUnits().value() == availableUnits)
                .collect(toList());
        }
    }

The ``@DataAccessImplementation`` annotation links attributes and data access implementations with ``Product``
aggregate. The ``storageName`` attribute is used to decide if the implementation should be
[loaded into the runtime](#run-your-model) or not. Implementations not matching the storage of the bundle being
configured are not loaded.


## Message listeners

Previous sections showed how to

- create and start a runtime,
- define and implement domain events and commands,
- submit them,
- manage persistence of data using aggregates and their services.

This section focuses on the handling of messages by the aggregates.

There are 2 types of messages in Pousse-Café: domain events and commands. One of the purposes of domain events
is to achieve eventual consistency (consistency rules spanning several aggregates).
Commands represent inputs from users or external systems.

Messages are directly handled by aggregate roots, factories or repositories.

The ``@MessageListener`` annotation is used to annotate a method that should handle a message. Such a method is called
a message listener. Message listeners are methods which
- must be public
- have a single argument: the message they consume (message definition interface must be used).

<p class="alert alert-info">
If the consumed message argument is of type <code>poussecafe.messaging.Message</code>, the message listener is called a
wildcard listener: it will handle all messages received by the runtime. However, this approach is not recommended
unless required as it implies a loss of specificity.
</p>

The `@MessageListener` annotation has 2 attributes which are independent of the container (i.e. the enclosing class):

- `processes` links the listener to a set of processes (represented by an interface or class extending or
  implementing `poussecafe.domain.Process`),
- `consumesFromExternal` names the external components or modules producing consumed message.

Both attributes are optional. By default, a message listener is linked to the default domain process 
(`poussecafe.discovery.DefaultProcess`) and consumes from no external component.

The information in above attributes is not used by the runtime. However, it enables:

- embedded documentation for developers, putting a given message listener in a context for the developer reading the code;
- the [generation of expert-readable documentation](#generating-expert-readable-documentation).

Message listener methods may also be annotated with `@ProducesEvent`. This annotation has 3 attributes:

- `value` is the produced domain event given by its definition interface,
- `required` tells if the issuance is required or not,
- `consumedByExternal` gives a list of external components consuming produced event.

Relying on this annotation, the runtime can check that expected events are actually issued and no unexpected events
are issued.
In case of failing check, the execution of the listener fails.

`@ProducesEvent` is also used when
[generating model's expert-readable documentation](#generating-expert-readable-documentation).

<p class="alert alert-warning">
For a given message type, there must be only at most one message listener per container (aggregate root, factory,
repository).
</p>


### Factory listeners

Factory message listeners are used to create aggregates when handling a message. They return the
aggregate(s) that should be created in response to the consumption of a message.

Below example illustrates listeners in a factory:

    ...
    public static class Factory extends AggregateFactory<...> {
    
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
    ...

- ``createMyAggregate`` creates an aggregate every time an event ``Event1`` is consumed.
- ``optionallyCreateMyAggregate`` creates conditionally an aggregate when an event ``Event2`` is consumed. When
``Optional.empty()`` is returned, no aggregate is created.
- ``createMyAggregates`` creates zero, one or several aggregates each time an event ``Event3`` is consumed.

When new aggregates are created, Pousse-Café automatically starts a transaction and commits (if the storage requires
it) when persisting each new aggregate. The creation itself i.e. the execution of the message listener
happens outside of the transaction (actually, before it).

The following algorithm describes how transactions are handled upon aggregate creation:

    "Execute factory listener"; // Listener
    while("all created aggregates not persisted") {
        "Start transaction";
        "Add aggregate";
        "End transaction";
    }


### Aggregate root listeners

Aggregate root message listeners are used to update aggregates when handling a domain event.

Below example describes a Product aggregate giving
the possibility to place an Order. The `OrderPlaced` event is issued if the order was placed successfully.

    ...
    public static class Root extends AggregateRoot<...> {
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
    ...

The identity of the aggregates to update needs to be extracted from the message. Therefore, an aggregate root
message listener requires a runner linked using the `runner` attribute. Runners are
[described in greater detail](#runners) later.

Aggregate root's ``newDomainEvent`` method returns a new instance of [event implementation](#implement-messages).
Aggregate root's ``issue`` method queues the event for issuance after the updated aggregate is successfully saved
to storage. Both methods may also be used within [hooks](#aggregate-root).

Below algorithm illustrates how an aggregate root listener and its runner are executed and how transactions are handled.

    "Compute aggregate identifiers to update"; // Runner
    while("all identifiers are not handled") {
        "Start transaction";
        "Fetch aggregate to update";
        "Execute update listener"; // Listener
        "Update aggregate;"
        "End transaction";
    }

<p class="alert alert-info">
<code>newDomainEvent</code> and <code>issue</code> are defined in
<code>poussecafe.domain.Entity</code>. It is therefore perfectly valid
to create and issue events inside of another aggregate's entity than the aggregate root.
</p>


### Repository listeners

Repository message listeners are used to remove aggregates from storage. They return the
identifier(s) of the aggregate(s) that should be deleted in response to the consumption of a message.

Below example illustrates a listeners in a repository:

    ...
    public static class Repository extends AggregateRepository<...> {
    
        @MessageListener
        public MyAggregateId deleteMyAggregate(Event1 event) {
            ...
        }
    
        @MessageListener
        public Optional<MyAggregateId> optionallyDeleteMyAggregate(Event2 event) {
            ...
        }
    
        @MessageListener
        public List<MyAggregateId> deleteMyAggregates(Event3 event) {
            ...
        }
    }
    ...

- ``deleteMyAggregate`` deletes an aggregate every time an event ``Event1`` is consumed.
- ``optionallyDeleteMyAggregate`` deletes conditionally an aggregate when an event ``Event2`` is consumed. When
``Optional.empty()`` is returned, no aggregate is deleted.
- ``deleteMyAggregates`` deletes zero, one or several aggregates each time an event ``Event3`` is consumed.


Below algorithm summarizes how a repository listener is executed and how transactions are handled.

    "Execute repository listener"; // Listener
    while("all aggregates not deleted") {
        "Start transaction";
        "Delete aggregate";
        "End transaction";
    }


### Runners

The `runner` attribute of `MessageListener` enables to link a listener to its runner. This is only necessary for
aggregate root listeners.

A runner is an instance of ``AggregateMessageListenerRunner<M, K, A>`` where

- ``M`` is the class of the consumed event,
- ``K`` is the class of aggregate's identifier (or any secondary identifier, see below),
- ``A`` is the aggregate root's class.

Runners are services i.e. they must be state-less. A single runner per aggregate root listener is instantiated by the
runtime.

``AggregateMessageListenerRunner`` interface is declared as follows:

    public interface AggregateMessageListenerRunner<M, K, A> {
    
        TargetAggregates<K> targetAggregates(M message);
    
        default Object context(M message, A aggregate) { return null; }
    
        default void validChronologyOrElseThrow(M message, A aggregate) {}
    }

``targetAggregates`` defines the identifiers of the aggregates to update given an event. It also allows to define the
identifiers of the aggregates whose creation is expected because they cannot be updated (see
[section collision handling](#collision-handling)).

``context`` returns the data required to execute the update i.e. information coming potentially from other
aggregates or external configuration. The use of an update context is not recommended but may be required in some
cases. By default, no context is returned (i.e. `context` returns null). The context can be accessed inside of an
aggregate root listener by calling `context()`. If no context was set by the listener, the call throws an exception.

For a description of `validChronologyOrElseThrow`, see [collision handling section](#collision-handling).

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


### Explicit domain processes

Sometimes, defining message listeners at factory, aggregate root and repository level is not flexible enough because
it does not enable the definition of more complex handling patterns. This is the purpose of
*explicit domain processes (EDP)*.

An EDP is a non-domain service which contains message listeners.
It is defined by a class extending ``poussecafe.process.DomainProcess``.
An EDP routes domain events or commands to an actual aggregate root, factory or repository,
potentially by first applying some custom processing (which is their main purpose).

Below example shows a very simple example of EDP.

    public class MyDomainProcess extends DomainProcess {
    
        @MessageListener
        public void doSomething(Event4 event) {
            runInTransaction(MyAggregate.class, () -> {
                MyAggregate.Root aggregate = repository.get(event.id().value());
                aggregate.handle(event);
                repository.update(aggregate);
            });
        }
    
        private MyAggregate.Repository repository;
    }

The `runInTransaction` method runs the provided `Runnable` in the context of a transaction.

<p class="alert alert-info">
Above example is equivalent to defining the message listener in <code>MyAggregate.Root</code> class and defining a
runner than returns a single ID equal to <code>event.id().value()</code>. There is no custom processing actually
executed.
</p>

<div class="alert alert-warning">
<p>Using EDPs is not recommended because</p>
<ul>
<li>it makes code less readable because of the boiler plate</li>
<li>some features (<a href="/doc/emil/#back-and-forth-between-emil-and-code">code generation</a>,
<a href="#generating-expert-readable-documentation">doc generation</a> and
<a href="#collision-handling">collision handling</a>) are not available or partially do not apply.</li>
</ul>
<p>Therefore, it is recommended to use EDPs only as a last resort.</p>
</div>

### Custom message listeners

In some circumstances, for instance when you want to react to a domain event in a component that is not managed by
Pousse-Café's runtime (e.g. a Spring Bean), you may define
custom message listeners. Custom message listeners are defined in the same way as factory, repository and domain process
listeners (i.e. using the `@MessageListener` annotation). The only difference is that they have to be registered
manually.

This is done by using `runtime`'s `registerListenersOf` method:

    runtime.registerListenersOf(service)

where `service` is the instance of the service containing the listeners. In order to prevent any loss, the listeners
should be registered before the runtime is actually started. Otherwise, the custom listener may miss messages.


### Message listeners execution order

No assumption should be made on the order in which message listeners will be executed when handling a given message.
However, there are priority rules given the type of listener.
Below list shows the order in which listener types are executed:

1. Repository listeners
2. Aggregate root listeners
3. Factory listeners
4. Domain process listeners
5. Custom listeners

So for example, if a group of listeners consumes a message `M`, it will first be handled by listeners defined in 
repositories, then by listeners defined in aggregate roots, etc.

If several listeners are defined per type (e.g. when several aggregates have listeners for the same message type),
the order in which they are executed is undefined.

There are several goals behind above priority rule:

- Define "update only" listeners in aggregates i.e. listeners that will not be executed on aggregates that were
previously created while handling the same message;
- Re-create an aggregate by removing it using a repository, then re-adding it with a factory;
- Prevent the removal by a repository of an aggregate previously created by a factory while handling the same message.


## Implement services

A service is defined by a Java class extending class ``Service`` with only the default constructor or an explicit
constructor taking no argument. A service might depend on other domain services (including factories and repositories).

Below example illustrates the definition of a service:

    public class Service1 implements Service {
    
        public Object produceSomethingUsingService2(Object input) {
            // Use service2
        }
    
        private Service2 service2;
    }

When instantiating `Service1`, Pousse-Café will inject the instance of `Service2` at runtime (`Service2` being a
service as well). This is also true for factories and repositories which may considered as "special" services.

In some cases, a service may be abstract because technical details need to be hidden in a specific implementation.
The `@ServiceImplementation` annotation can then be used to annotate the actual implementation and link it to
the abstract service using attribute `service`.


## Test your model

Pousse-Café provides tools allowing to easily test your model processes with no heavy storage setup required.
Actually, you might write your whole domain logic even before deciding what kind of
storage you would be using. More importantly, it means that you can focus your tests on the domain.

For testing, it is suggested to use the default in-memory storage implementation provided by Pousse-Café.
When actually integrating your Model in a real application, you could
then just choose another implementation [when building the runtime](#run-your-model).

`PousseCafeTest` class can be extended to write (e.g. JUnit) tests involving different Bundles.
`PousseCafeTest` essentially
- instantiates a runtime,
- inject services into the test case and
- provides helpers in order to make tests more readable.

Below example illustrates a test verifying that the handling of `CreateProduct` command actually creates a new
`Product` aggregate.

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
the `issue` method for direct issuance of domain events.

`orderRepository` is automatically injected by `PousseCafeTest`'s runtime.

The scope of Pousse-Café tests is rather broad: it may span several aggregates and imply many events.
Therefore, Pousse-Café tests should be considered as "functional integration tests" in the sense that they are already
harder to maintain and are slower than regular unit tests.
Nonetheless, they enable to test eventual consistency following the consumption of a given command or event
by the runtime, which is useful, particularly if that information is reported.


### Initial state

Generally, when testing the handling of a command or domain event, you need an initial data set to be available (i.e.
an initial state for a collection of aggregates).

You may do this programmatically (by submitting a sequence of commands and/or domain events). However, this approach
may produce code which is hard to maintain: each time the process leading to the initial state you are trying to 
produce changes, you may have to modify your test code, even if the result remains unchanged.

Another possibility is to directly load data sets so that they are available through repository queries.
This may be done as follows:

    var dataSet = new DataSet.Builder()
        .withAggregateData(Product.Root.class, buildSomeProductData())
        .withAggregateData(Product.Root.class, buildOtherProductData())
        .withAggregateData(Customer.Root.class, buildCustomerData())
        .build();
    given(dataSet);

The above code should be executed in a method of a subclass of `PousseCafeTest`. As a result, the data are loaded
into the test storage.


### Unit testing an entity

Sometimes, one wants to only test a single method of an entity (e.g. a single message listener). In order to produce
such an entity, there are 2 possibilities:

1. use a factory,
2. build the entity manually.

The first possibility may require some heavy setup in order to ensure that all constraints checked by the factory are met.
Therefore, in some cases, the second possibility is preferred. In order to prevent the tedious work of manually
building the entity (set data and other Pousse-Café implementation details), `PousseCafeTest` defines a `newEntity`
method which produces an empty instance. One can then set the required attributes and run its test against it.


### Behavior-Driven Development testing

`PousseCafeTest` exposes methods enabling to write tests following the given-when-then style defined by
[Behavior-Driven Development (BDD)](https://dannorth.net/introducing-bdd/).

- `given(X)` method loads some initial state into test storage (see [above](#initial-state)),
- `when(X)` method is equivalent to `issue(X)` if `X` is a domain event or `submitCommand(X)` if `X` is a command.

This enables to write a test looking like this:

    @Test
    public void placingOrderOnAllUnitsEmptiesOrder() {
        given(productWith10UnitsAvailable);
        givenPlaceOrderForUnits(10);
        when(placeOrder);
        thenProductUnitsAvailable(0);
    }

- `given(productWith10UnitsAvailable)` loads a product aggregate with 10 units available in the storage
(`productWith10UnitsAvailable` field references a `DataSet` instance with data representing that state)
- `givenPlaceOrderForUnits` method builds a command for placing an order for given number of units and sets
`placeOrder` field.
- `thenProductUnitsAvailable` checks that the aggregate created initially has the given number of available units
left.


## Collision Handling

Once you deploy your application in a distributed environment, you will more than likely want to achieve high performance
and/or high availability which may both be obtained by multiplying the number of processing nodes. In the context of
a Pousse-Café application, this generally means that you will have several Pousse-Café runtime instances executed by
different nodes running the same Modules and, therefore, the same sets of listeners.

The problem is that you will start experiencing "collisions" i.e. several listeners trying to update or create the
same aggregate at the same time.

In a single node environment, even with several processing threads, Pousse-Café is able to prevent collisions. However,
in a multi-node environment, this is not possible (except at a potentially high synchronization cost in terms of
execution time).

Ideally, a model should be designed in a way that the probability of collision is as low as possible.
Having many small aggregates instead of a few big ones helps. However, it is sometimes not possible to prevent them
completely (i.e. the probability of collision cannot be reduced to zero).

To handle this issue, Pousse-Café implements a rather simple mechanism: when a collision is detected while running a
listener, the execution of the listener is retried a bit later, potentially several times, until the listener is
successfully executed.

This mechanism implies that messages may not be handled in a strict sequence anymore: a retry may cause
that a message that was sent before another one is actually handled after it. The model has to be designed in a way
that supports this. If strict sequences are required, proper synchronization mechanisms have to be implemented.
Pousse-Café provides means to [skip or retry the execution of listeners](#handle-message-chronology-issues) in order to 
prevent data inconsistencies.


### Detecting Collisions

Collisions are detected in two situations:

1. An update fails with an optimistic locking error,
2. An insertion fails with a duplicate key error when it should not (i.e. the insertion is expected to be successful).

First situation is rather obvious: the execution of the listener which failed with an optimistic locking error
must simply be retried.

Second situation is more difficult to detect: if a duplicate key error occurs, it should be detected as a collision only if
an update listener on the same aggregate was not executed because the aggregate did not exist at the time it was
executed. Indeed, this configuration means that another instance running in parallel created the aggregate in the
meantime. If this did not happen, the duplicate key error must be interpreted as a regular failure (i.e. probably
a bug).

The fact that a skipped update requires a subsequent creation is noticed via a `TargetAggregates<K>` instance
returned by a runner (see [aggregate root listeners runners](#runners)). For example, the following code inside
of Runner's `targetAggregates` method tells to Pousse-Café that aggregate with identifier `id` might be updated but
if it is not, then it must be created:

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

The creation itself must be handled by a [factory listener](#factory-listeners). Above logic is implemented by helpers
`UpdateOrCreateRunner` and `UpdateOrCreateOneRunner`. It is recommended to extend one of them when using
"update or create" pattern in a collision-prone environment.

Note that in a collision-free environment, the "else" block of above code is useless as creation will always be
executed in the case no update was.


### Handle message chronology issues

In a runner, the `validChronologyOrElseThrow` method may be overridden. It checks if, based on an aggregate's state,
the message arrives at the right time or not. This method
must throw one of the following exceptions if the message listener must not be executed and the aggregate must not
be updated:

- `SameOperationException` tells that the execution of the message listener must be skipped (e.g. because inspection
 of `aggregate`'s state tells that the message has already been handled),
- `RetryOperationException` tells that the execution of the message listener must be postponed (e.g. messages are 
expected in sequence and a gap was detected),
- `IllegalArgumentException` tells that given message is unexpected, an error is reported and listener execution
  skipped.

The exceptions listed above may be thrown by the message listener itself. However, this causes the business
logic inside of the listener to be crippled by technical details.


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

Pousse-Café's [Maven plugin](/pousse-cafe-maven-plugin/plugin-info.html) provides the
[generate-doc](/pousse-cafe-maven-plugin/generate-doc-mojo.html) goal.
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


### Domain processes

A domain process is essentially described by a directed graph where:

- each node represents a message listener attached to the process;
- each edge represents domain event issued by a source listener and handled by destination listener.

Pousse-Café Doc uses `@MessageListener` and `@ProducesEvent` annotations to build the graph.

The name of the domain process is the name of a class extending `poussecafe.domain.Process`.

The description of the domain process is given by javadoc comment's body. HTML tags may be used for formatting.

"Virtual nodes" may have to be added to the graph to illustrate the fact that some events are coming from or going 
to non-domain components (in case of integration with an external system) or other Modules.
This is controlled by
- `@MessageListener`'s `consumesFromExternal` attribute which contains a list of names
identifying the non-domain components or Modules producing the message consumed by the message listener;
- `@ProducesEvent`'s `consumedByExternal` attribute which contains a list of names
identifying the non-domain components or Modules consuming the message produced by the message listener;


## More on Attributes

Attributes [were introduced](#introducing-attributes) previously. This section describes them further.


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

<p class="alert alert-info">
A data adapter can be built from an auto-adapter by using factory method
<code>DataAdapters.auto(MyType.class, MyTypeAutoAdapter.class)</code> which returns an instance of
<code>DataAdapter&lt;MyTypeAutoAdapter, MyType&gt;</code>.
</p>


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

## Spring Integration

Instantiating a Pousse-Café runtime inside of a Spring application is easy thanks to Pousse-Café's
[Spring Bridge](https://github.com/pousse-cafe/pousse-cafe-spring). See the README for more details about how
to achieve this.

## Storage Plug-Ins

- [Pousse-Café Spring Mongo](https://github.com/pousse-cafe/pousse-cafe-spring-mongo)
- [Pousse-Café Spring JPA](https://github.com/pousse-cafe/pousse-cafe-spring-jpa)

## Messaging Plug-Ins

- [Pousse-Café Spring Pulsar](https://github.com/pousse-cafe/pousse-cafe-spring-pulsar)
- [Pousse-Café Spring Kafka](https://github.com/pousse-cafe/pousse-cafe-spring-kafka)
