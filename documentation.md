---
layout: page
title: Reference Guide
permalink: /doc/reference-guide
---

## Introduction

The main purpose of Pousse-Café is to provide tools making the development of high quality and production-ready [Domain-Driven Design
(DDD)](https://en.wikipedia.org/wiki/Domain-driven_design)-based applications easier. Indeed, while DDD is an effective 
tool when designing applications with complex business needs, its actual implementation generally brings a set of
technical issues/questions that need to be addressed. Those questions and issues require a good knowledge
of DDD to be properly handled. The next section quickly summarizes DDD, focusing on the elements that Pousse-Café covers,
in order to introduce the elements required to describe precisely Pousse-Café's purpose. If you already know
enough on DDD, feel free to skip it.

## Domain-Driven Design in a nutshell

Domain-Driven Design (DDD) defines a set of tools targeting better communication, deeper description of concepts, cleaner
code and scalable software. It relies on the definition of a common language (the *Ubiquitous Language*) for domain
experts and developers. The *Domain* is the model of the reality an organization is working in. It is described using the
terms defined by the Ubiquitous Language. When building a software,
you actually implement the Domain. When applying DDD, domain experts and developers work closely to
define the Domain together. The Domain and the code evolve simultaneously. DDD defines several design elements:

- An *Entity* is an object that has an identity (i.e. it can be referenced) and a life-cycle (it is created, altered and maybe disposed). For instance,
a product sold in an e-shop is initially created, its description updated, out for sell, sold-out and then finally removed.
- A *Value Object* (VO) is an object without identity which is fully described by its attributes and is immutable.
For instance, the price of a product.
- A *Service* is a stateless object that represents an operation that does not naturally belong to an Entity or a VO.
- An *Aggregate* is a cluster of associated Entities that is treated as a unit, defines strong consistency rules on state
changes and has a *Root Entity* (the only Entity of the cluster that can be referenced from outside of the cluster).
- *Domain Events* are events emitted when an Aggregate is updated. They can then trigger the update of other Aggregates,
allowing the definition of invariants spanning several Aggregates. No assumption should be made on when a Domain Event
is actually handled, this means that invariants spanning several Aggregates are not always true at all times (by
opposition to Aggregate consistency rules which are always true).
- *Eventual Consistency* is the fact that, after some time, all invariants, including the ones spanning several Aggregates,
are true.
- A *Factory* is a Service that creates Aggregates that are consistent.
- A *Repository* is a Service that retrieves, stores, updated and removes Aggregates from storage.

## The purpose of Pousse-Café

As mentioned in the introduction, implementing DDD brings a set of technical questions and issues. Below the ones
that Pousse-Café addresses.

- The implementation of Domain Events (i.e. their publication and consumption) generally involves a messaging infrastructure. It
is, in a distributed context, not possible to prevent that some messages are actually delivered twice, which means that the same Domain
Event might be consumed several times. Pousse-Café keeps track of the handling of all Domain Events
allowing for the detection of duplicate consumptions.
- When writing Domain logic, the code must be as exempt as possible of technical elements. It is easy to end up in a
situation where storage-related issues are handled by code that is part of the implementation of a Domain component
(Aggregate, Service, etc). Pousse-Café defines a way of implementing Aggregates allowing this (see section *Implement
Aggregates*).
- The consumption of Domain Events might temporarily fail. In some cases, they should be consumed again to
resume a process. Pousse-Café provides a mechanism to retrieve and replay Domain Events which could not be successfully
handled (see section *Replay Domain-Events and Commands*).

Pousse-Café relies on the definition of a *Meta-Application* which is composed of the Domain implementation as well as
Domain Processes. The goal is to define the Meta-Application in a way that is as independent as possible of relying
technologies and then instantiate it in an actual application by plugging in the required adapters.

## Implement Aggregates

An important element in Pousse-Café is the Aggregate and its related Services (i.e. the Factory and the Repository).
An Aggregate is implemented by a class extending `AggregateRoot<K, D>` where `K` is the type representing the key that
can be used to reference the Aggregate and `D` is the type representing the data related to the Aggregate. Indeed,
Pousse-Café decouples as much as possible the Domain model from the data model. This way, the Aggregate's implementation
is not crippled by technical details about how data have to be defined or annotated to fit the underlying storage technology.
Type `D` must implement the interface `IdentifiedStorableData<K>` which essentially defines a property for Aggregate's key.

Below example describes the Product Aggregate featuring
the possibility to place an Order i.e. remove a number of units from the number of available units. If there are enough
units available, the `OrderPlaced` Event is added. Otherwise, the `OrderRejected` Event is added.

    public class Product extends IdentifiedStorableData<ProductKey, Data> {
        ...
    
        public void placeOrder(OrderDescription description) {
            int unitsAvailable = getData().getAvailableUnits();
            if (description.units > unitsAvailable) {
                addDomainEvent(new OrderRejected(getData().getKey(), description));
            } else {
                getData().setAvailableUnits(unitsAvailable - description.units);
                addDomainEvent(new OrderPlaced(getData().getKey(), description));
            }
        }
    
        public static interface Data extends AggregateData<ProductKey> {
            ...
    
            void setAvailableUnits(int units);
    
            int getAvailableUnits();
        }
    }

Note that the interface defining the data of an Aggregate should define properties, each property being defined by a
setter and a getter or a method returning a `Property` instance. So for example, in above Entity, the property
`availableUnits` is defined by getter `getAvailableUnits` and setter `setAvailableUnits`.

Domain Events are implemented by classes extending the `DomainEvent` class. The following example shows a part of the
implementation of the `OrderPlaced` Event.

    public class OrderPlaced extends DomainEvent {
        private ProductKey productKey;
    
        private OrderDescription description;
    
        public OrderPlaced(ProductKey key, OrderDescription description) {
            setProductKey(key);
            setOrderDescription(description);
        }
    
        ...
    }


In order to create Aggregates, a Factory is needed. A Factory extends the `Factory<K, A, D>` class where `K` is the type of
the Aggregate's key, `A` is the Aggregate's type and `D` the type of Aggregate's data. The following example shows a
Factory for the Product Aggregate. It allows the creation of a Product with no available units initially.

    public class ProductFactory extends Factory<ProductKey, Product, Product.Data> {
        public Product buildProductWithNoStock(ProductKey productKey) {
            Product product = newAggregateWithKey(productKey);
            product.setTotalUnits(0);
            product.setAvailableUnits(0);
            return product;
        }
    }

Finally, Aggregates need to be saved, updated and removed from storage. That's the purpose of the Repository which is
implemented by extending the `Repository<A, K, D>` class where `A` is the Aggregate's type, `K` is the type of
the Aggregate's key and `D` the type of Aggregate's data. The following example shows a Repository for the Product
Aggregate.

    public class ProductRepository extends Repository<Product, ProductKey, Product.Data> {
      
    }

The Repository class defines the following default operations:

    A find(K key);
    A get(K key);
    void add(A aggregate);
    void update(A aggregate);
    void delete(K key);

where `find` returns an Aggregate of null if none was found, `get` returns an Aggregate or throws an exception if the
Aggregate was not found, `add` allows to add a new Aggregate, `update` updates an existing aggregate and `delete` removes
an Aggregate from storage if it was present.

## Implement Domain Services

Domain Services (or simply Services) are defined using POJOs. A Service might depend on other Domain Services. Pousse-Café
provides a minimal dependency injection feature for the injection of Domain Services (including Repositories and Factories).
A setter or a field for each dependency is needed. Below example shows `Service1` depending on `Service2` and `Service3`.
`Service1` has a field with type `Service2` allowing Pousse-Café to inject a `Service2` instance at runtime.
It also has a setter for a `Service3` instance, leading to the same result but allowing to implement any logic triggered
at injection time. Note that a method is considered as a setter as soon as it starts with `set` and takes a single
parameter whose type is an injectable Service.

    public class Service1 {
        private Service2 service2;

        private Service3 service3;

        public void setService3(Service3 service3) {
            this.service3 = service3;
        }
    }

## Handle Domain Events

Aggregates and Domain Services provide a good model for the Domain being implemented but are not enough to fully describe
an application. One missing part is the one actually triggering the different operations implemented by the Aggregates and
that reacts to Domain Events. This is the purpose of *Domain Processes*.

A Domain Processes is a non-Domain service which defines listeners that consume Domain Events. The main purpose
of a Domain Process is to implement commands and route Domain Events to an actual Aggregate or a Domain Service.
Below example shows a Domain Process which handles the product creation command and handles the `ProductCreated` event.

    public class ProductManagement extends DomainProcess {

        private ProductFactory productFactory;
    
        private ProductRepository productRepository;

        public void createProduct(CreateProduct command) {
            Product product = productFactory.buildProductWithNoStock(command.getProductKey());
            runInTransaction(Product.class, () -> productRepository.add(product));
        }

        @DomainEventListener
        public void doSomething(ProductCreated event) {
            ...
        }
    }

The `runInTransaction` method runs the provided `Runnable` in the context of a transaction. What this actually
means depends on the storage technology used for related Aggregate. For instance, if the Product's data are stored
directly in memory, no transaction is actually created. On the other hand, if data are stored in a transactional storage system,
a transaction should be started before the `Runnable` is run and committed just after its successful execution.

In the same way as for Domain Services, Pousse-Café will inject all required Services if the related setters are defined.

## Run your Meta-Application

A running Pousse-Café Meta-Application is represented by a *Meta-Application Context* (or *Context*). The Context
instantiates all required services and injects them when necessary. It also gives access to Aggregates via their related
Repository and Factory.

In order to instantiate a Meta-Application Context, a *Meta-Application Bundle* is needed. This is represented
by a `MetaApplicationBundle` instance. A `MetaApplicationBundle` describes the Domain Processes, Services
and Aggregates composing the Meta-Application. Below example shows a `MetaApplicationBundle` sub-class which
describes a Meta-Application composed of an Aggregate, a Domain Service and a Domain Process:

    public class SampleMetaAppBundle extends MetaApplicationBundle {
        @Override
        protected void loadDefinitions(Set<StorableDefinition> definitions) {
            definitions.add(new StorableDefinition.Builder()
                    .withStorableClass(Product.class)
                    .withFactoryClass(ProductFactory.class)
                    .withRepositoryClass(ProductRepository.class)
                    .build());
        }
    
        @Override
        protected void loadImplementations(Set<StorableImplementation> implementations) {
            implementations.add(new StorableImplementation.Builder()
                    .withStorableClass(Product.class)
                    .withDataFactory(ProductData::new)
                    .withDataAccessFactory(ProductDataAccess::new)
                    .withStorage(InMemoryStorage.instance())
                    .build());
        }

        @Override
        protected void loadProcesses(Set<Class<? extends DomainProcess>> processes) {
            processes.add(ProductManagement.class);
        }
    
        @Override
        protected void loadServices(Set<Class<?>> services) {
            services.add(ContentChooser.class);
        }
    }

Aggregates are defined by a Factory and a Repository. They are implemented by a Data factory (a `java.util.function.Supplier` which produces empty data
implementations) and a Data Access factory (a `java.util.function.Supplier` which produces a service that reads the data from an actual storage).
In above example, the default in-memory storage provided by Pousse-Café is used.
`ProductData` only needs to be serializable (in the Java sense):

    public class ProductData implements Product.Data, Serializable {

        @Override
        public void setAvailableUnits(int units) {
            this.availableUnits = units;
        }

        private int availableUnits = 0;

        @Override
        public int getAvailableUnits() {
            return availableUnits;
        }
    }

`ProductDataAccess` must be a subclass of `InMemoryDataAccess`:

    public class ProductDataAccess extends InMemoryDataAccess<ProductKey, Product.Data> {
      
    }

Definition and implementation are separated to allow the choice of different storage implementations.
This can be done by overriding `loadImplementations`. The other methods should normally not have to be overridden as
they represent storage independent components.

A Meta-Application Context for above bundle can be created as follows:

    MetaApplicationContext context = new MetaApplicationContext();
    context.loadBundle(new SampleMetaAppBundle());
    context.start();

Note that the call to `start` is non blocking.

You can then start calling Domain Processes and retrieve Aggregates using their Repository. Below
snippet shows how to create a Product Aggregate and access it via its Repository:

    ProductKey productKey = new ProductKey("product-1");
    context.getDomainProcess(ProductManagement.class).createProduct(new CreateProduct(productKey));
    if (result.isSuccess()) {
        return context.getStorableServices(Product.class).getRepository().get(productKey);
    } else {
        throw new Exception("Unable to create Product");
    }

## Test your Meta-Application

Pousse-Café provides some tools allowing to easily test your Meta-Application with no heavy storage setup required.
Actually, you might write your whole Domain logic even before deciding what kind of
storage you will be using. More importantly, it means that you can focus your tests on the Domain.

For testing, it is suggested to use the default in-memory storage implementation provided by Pousse-Café and configure it
in a base Meta-Application Bundle. When actually integrating your Meta-Application in a real application, you would
then just choose another implementation using the real storage by subclassing the base Meta-Application Bundle and
override `loadImplementations` (see above).

Pousse-Café provides a `MetaApplicationTest` which can be extended to write (JUnit 4) tests involving parts of the
Meta-Application. What this class does is essentially instantiating a Meta-Application Context and providing some
helpers to access its components. Below example shows a test verifying that a product creation actually ends in the
product being available from the Repository.

    public class ProductManagementTest extends MetaApplicationTest {
        @Override
        protected MetaApplicationBundle testBundle() {
            return new SampleMetaAppBundle();
        }

        @Test
        public void productCanBeCreated() {
            ProductKey productKey = new ProductKey("product-id");
            context().getDomainProcess(ProductManagement.class).createProduct(new CreateProduct(productKey));
            assertThat(find(Product.class, productKey), notNullValue());
        }
    }

`context` method provides the running Meta-Application Context created from provided bundle. `getDomainProcess` provides
the Domain Process instance in the context. Finally, `find` method is a shortcut actually retrieving the Repository
linked to given Aggregate Root and calling the `find` method of the Repository with given key.

`find` also waits that all
Domain Events published when executing the command are actually consumed. This ensures that there will be no race
condition between the asynchronous handling of Domain Events and the fact that the Aggregate being fetched might be
created as a consequence of the consumption of one of those events.

## Replay Domain Events

In Pousse-Café terminology, Domain Events are a particular case of *Message*.
Pousse-Café provides a component called the *Message Replayer*. This component can be used to replay a Message i.e.
submit it again to be handled by listeners. If the
Message was already handled successfully by a listener, it will not be handled again. The only listeners that will
handle it again are the ones who failed to consume the Message up to that moment.

The Message Replayer can
be retrieved from Meta-Application Context using the `getMessageReplayer` method. Below an example of usage
of the Message Replayer where a Message with ID `messageId` is replayed:

    context.getMessageReplayer().replayMessage("messageId");

To replay all Messages that were not successfully consumed by a listener, you can also call
`replayAllFailedConsumptions` which takes no argument.

Finally, in order to access the consumption failures, the *Consumption Failure Repository*, available via the Meta-Application
Context, gives access to the list of failed consumptions.

    context.getConsumptionFailureRepository().findAllConsumptionFailures();

The returned list contains objects of class `ConsumptionFailure`. There is one entry per Message which consumption
failed for at least 1 listener.

## Spring Boot Integration

Instantiating a Pousse-Café Meta-Application inside of a Spring Boot application is easy. First, you'll need a
Spring configuration class:

    @Configuration
    @ComponentScan(basePackages = { "poussecafe.spring" })
    public class AppConfiguration {
    
        @Bean
        public MetaApplicationContext pousseCafeApplicationContext() {
            MetaApplicationContext context = new MetaApplicationContext();
            context.loadBundle(new SampleMetaAppBundle());
            context.start();
            return context;
        }
    }

The `poussecafe.spring` package needs to be added to the component scan to build the bridge between Pousse-Café and
Spring's application context (an additional dependency is needed). Basically, this will enable the injection of Pousse-Café services as Spring beans and
allow the injection of Spring beans in Pousse-Café services. Note that the latter is not recommended as you would be
bringing non-domain elements inside of your domain logic. The only exception is the injection of Spring Data repositories
in Data Access services (see below).

The `MetaApplicationContext` instance is built and started before being exposed as a regular Spring bean.

After that, you can access Domain Processes and Repositories directly from Spring components. Below an example of a
Spring Web controller exposing a Domain Process command via a REST resource:

    @RestController
    public class RestResource {

        @Autowired
        private ProductManagement productManagement;
    
        @RequestMapping(path = "/product", method = RequestMethod.POST)
        public void createProduct(@RequestBody CreateProductView input) {
            ProductKey productKey = new ProductKey(input.key);
            productManagement.createProduct(new CreateProduct(productKey));
        }
    }

The `ProductManagement` Domain Process is directly available via Spring injection.

## An example of alternative storage: MongoDB

To implement an Aggregate with MongoDB Data and Data Access, Pousse-Café provides an integration (available via an
additional dependency) with
[Spring Data MongoDB](https://projects.spring.io/spring-data-mongodb/).

Implementing an Aggregate (e.g. above `Product`) with MongoDB requires 3 additional classes/interfaces:

- The data class, representing the document to insert/retrieve to/from a collection,
- The data access class, representing the service accessing the documents,
- the Mongo repository interface required by Spring Data to do its magic.

`ProductData` would look like this:

    public class ProductData implements Product.Data {
        @Override
        public void setAvailableUnits(int units) {
            availableUnits = units;
        }
    
        private int availableUnits;
    
        @Override
        public int getAvailableUnits() {
            return availableUnits;
        }
    }

This is not far from the default implementation presented above. The only difference is that this class does not need
to be Java-serializable.

`ProductDataAccess` looks like this:

    public class ProductDataAccess extends MongoDataAccess<ProductKey, ProductData, String> {

        @Autowired
        private ProductMongoRepository repository;
    
        @Override
        protected String convertKey(ProductKey key) {
            return key.getValue();
        }
    
        @Override
        protected MongoRepository<ProductData, String> mongoRepository() {
            return repository;
        }
    
    }

`MongoDataAccess` is a class provided by Pousse-Café filling the gap between the Mongo repository and Pousse-Café's
Data Access interface. It is also responsible for the conversion between the Domain key and the MongoDB-specific key
(which should must be Java-serializable). As you can see, the `repository` field is annotated with `@Autowired`. This
is the particular case where a Pousse-Café component (the Data Access) actually needs direct injection by Spring (see
previous section).

`ProductMongoRepository` is the Spring Data interface defined as:

    public interface ProductMongoRepository extends MongoRepository<ProductData, String> {
    
    }

Note that, the Mongo repositories discovery might have to be configured via `@EnableMongoRepositories` annotation (Spring
Boot documentation).

The default bundle needs to be subclassed to replace default implementation by this one:

    import poussecafe.sample.domain.mongo.ProductData;
    import poussecafe.sample.domain.mongo.ProductDataAccess;
    import poussecafe.spring.mongo.journal.JournalEntryData;
    import poussecafe.spring.mongo.journal.JournalEntryDataAccess;

    public class SampleMetaAppMongoBundle extends SampleMetaAppBundle {

        @Override
        protected void loadCoreImplementations(Set<StorableImplementation> coreImplementations) {
            coreImplementations.add(new StorableImplementation.Builder()
                    .withStorableClass(JournalEntry.class)
                    .withDataFactory(JournalEntryData::new)
                    .withDataAccessFactory(JournalEntryDataAccess::new)
                    .withStorage(MongoDbStorage.instance())
                    .build());
        }

        @Override
        protected void loadImplementations(Set<StorableImplementation> implementations) {
            implementations.add(new StorableImplementation.Builder()
                    .withStorableClass(Product.class)
                    .withDataFactory(ProductData::new)
                    .withDataAccessFactory(ProductDataAccess::new)
                    .withStorage(MongoDbStorage.instance())
                    .build());
        }
    }

Finally, Spring configuration must use the new bundle:

    @Configuration
    @ComponentScan(basePackages = { "poussecafe.spring" })
    public class AppConfiguration {
    
        @Bean
        public MetaApplicationContext pousseCafeApplicationContext() {
            MetaApplicationContext context = new MetaApplicationContext();
            context.loadBundle(new SampleMetaAppMongoBundle());
            context.start();
            return context;
        }
    }
