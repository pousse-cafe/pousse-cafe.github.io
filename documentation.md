---
layout: page
title: Reference Guide
permalink: /doc/reference-guide
---

## Introduction

The main purpose of Pousse-Café is to provide tools making the development of high quality and production-ready [Domain-Driven Design
(DDD)](https://en.wikipedia.org/wiki/Domain-driven_design)-based applications easier. Indeed, while DDD is an effective 
tool when designing applications with complex business needs, its actual implementation generally brings a set of
technical issues/questions that need to be addressed. Those questions and issues require a good enough knownledge
of DDD to be understood. The next section quickly summarizes DDD, focusing in the elements that Pousse-Café addresses,
in order to introduce the elements required to describe precisely Pousse-Café's purpose. If you already know
enough on DDD, feel free to skip it.

## Domain-Driven Design in a nutshell

Domain-Driven Design (DDD) defines a set of tools targeting better communication, deeper description of concepts, cleaner
code and scalable software. It relies on the definition of a common language (the *Ubiquitous Language*) for domain
experts and developers. The *Domain* is the model of the reality an organization is working in. It is described using the
terms defined by the Ubiquitous Language. When building a software,
you actually implement the Domain. When applying DDD, domain experts and developers work closely to
define the Domain together. The Domain and the code evolve together. DDD defines several design elements:

- An *Entity* is an object that has an identity (i.e. it can be referenced) and a life-cycle (it is created, altered and maybe disposed). For instance,
a product sold in an e-shop is initially created, its description updated, out for sell, sold-out and then finally removed.
- A *Value Object* (VO) is an object without identity which is fully described by its attributes and is immutable.
For instance, the price of a product.
- A *Service* is a stateless object that represents an operation that does not naturally belong to an Entity or a VO.
- An *Aggregate* is a cluster of associated objects that is treated as a unit, defines strong consistency rules on state
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
Event might be consumed several times.
- Concurrent modifications of the same Aggregate need to be handled. With transactional storage systems, optimistic
concurrency control is often used for scalability reasons but in that case, updates might frequently fail. On the other
hand, when using non-transactional storage systems, concurrent modifications should not endanger data consistency.
- When writing Domain logic, the code must be as exempt as possible of technical elements. It is easy to end up in a
situation where storage-related issues are handled by code that is part of the implementation of a Domain component
(Aggregate, Service, etc).
- The consumption of Domain Events might temporarily fail. In some cases, the Domain Events should be consumed again to
resume a process.
- Eventual consistency sometimes makes it sometimes hard to figure out when some operation is actually done. This is an
issue when users are for instance expecting feedback on the progress of an operation they triggered.

Pousse-Café relies on the definition of a *Meta-Application* which is composed of the Domain implementation as well as
additional non-Domain components allowing the full description of the needs (i.e. not only the model but also the way it
will be used). The goal is to define the Meta-Application in a way that is as independent as possible of relying technologies
and then instantiate it in an actual application by plugging in the required adapters.

## Implement Aggregates

An important element in Pousse-Café is the Aggregate and its related Servies (i.e. the Factory and the Repository).
An Aggregate is implemented by a class extending `AggregateRoot<K, D>` where `K` is the type representing the key that
can be used to reference the Aggregate and `D` is the type representing the data related to the Aggregate. Indeed,
Pousse-Café uncouples as much as possible the Domain model from the data model. This way, the Aggregate's implementation
is not crippled by technical details about how data have to be defined or annotated to fit the underlying storage technology.
Type `D` must implement the interface `AggregateData<K>` which essentially defines a getter and a setter for Aggregate's key.

Below example describes the Product Aggregate featuring
the possibility to place an Order i.e. remove a number of units from the number of available units. If there are enough
units available, the `OrderPlaced` Event is added. Otherwise, the `OrderRejected` Event is added.

    public class Product extends AggregateRoot<ProductKey, Data> {
    
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
setter and a getter. So for instance, in above example, the property `availableUnits` is defined by getter
`getAvailableUnits` and setter `setAvailableUnits`. Not doing so prevents Pousse-Café to provide a default in-memory
implementation which is useful for testing among other things (see Testing section).

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
    
        @Override
        protected Product newAggregate() {
            return new Product();
        }
    }

Finally, Aggregates need to be saved, updated and removed from storage. That's the purpose of the Repository which is
implemented by extending the `Repository<A, K, D>` class where `A` is the Aggregate's type, `K` is the type of
the Aggregate's key and `D` the type of Aggregate's data. The following example shows a Repository for the Product
Aggregate.

    public class ProductRepository extends Repository<Product, ProductKey, Product.Data> {
    
        @Override
        protected Product newAggregate() {
            return new Product();
        }
    
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
A setter for each Service to inject is required. Below example shows `Service1` depending on `Service2`. `Service1`
exposes a setter for `Service2` allowing Pousse-Café to inject a `Service2` instance at runtime. Note that a method
is considered as a setter as soon as it starts with `set` and takes a single parameter whose type is an injectable
Service.

    public class Service1 {
    
        private Service2 service2;
        
        public void setService2(Service2 service2) {
            this.service2 = service2;
        }
    
    }

## Execute operations and handle Domain Events

Aggregates and Domain Services provide a good model for the Domain being implemented but are not enough to fully describe
an application. One missing part is the one actually triggering the different operations implemented by the Aggregates and
that reacts to Domain Events. Pousse-Café provides 2 elements for this: *Commands* and *Workflows*.

A Command is a non-Domain event which describes a request to execute an operation available in the model, for instance
placing an order (see example in Aggregates section). A Command is implemented by extending the `Command` class as
shown in the following example.

    public class PlaceOrder extends Command {
    
        private ProductKey productKey;
    
        private OrderDescription description;
    
        public PlaceOrder(ProductKey productKey, OrderDescription description) {
            setProductKey(productKey);
            setOrderDescription(description);
        }
    
        ...
    
    }

A *Workflow* is a non-Domain service which defines listeners that consume a Command or a Domain Event. The main purpose
of a Workflow instance is to convert the consumption of a Command or a Domain Event in an actual call to a method of an
Aggregate or a Domain Service. Below example is a Workflow which handles the Command for creating a Product. The listener
for `CreateProduct` command is defined by the method annotated with `@CommandListener` annotation and taking as single
argument an instance of `CreateProduct`.
In a Pousse-Café meta-application, there must be zero or one listener per Command. However, there can be any number of
listeners for a Domain Event. In below example, there are 2 listeners for the same Domain Event.

    public class ProductManagement extends Workflow {
    
        private ProductFactory productFactory;
    
        private ProductRepository productRepository;

        @CommandListener
        public void createProduct(CreateProduct command) {
            Product product = productFactory.buildProductWithNoStock(command.getProductKey());
            runInTransaction(() -> productRepository.add(product));
        }

        @DomainEventListener
        public void doSomething(ProductCreated event) {
            ...
        }

        @DomainEventListener
        public void doSomethingElse(ProductCreated event) {
            ...
        }

        public void setProductFactory(ProductFactory productFactory) {
            this.productFactory = productFactory;
        }
    
        public void setProductRepository(ProductRepository productRepository) {
            this.productRepository = productRepository;
        }
    }

The `runInTransaction` method runs the provided `Runnable` instance in the context of a transaction. What this actually
means depends on the storage technology used for related Aggregate. For instance, if the Product's data are stored
in-memory, no transaction is actually created. On the other hand, if data are stored in a transactional storage system,
a transaction should be started before the `Runnable` is run and committed just after its execution.

In the same way as for Domain Services, Pousse-Café will inject all required Services if the related setters are defined.

## Submit Commands

Commands are submitted using the `CommandProcessor`. This non-Domain service ensures that all Commands are handled
sequentially and routed to their listener. The actual submission of a Command is done via a call to the following method:

    BlockingSupplier<CommandHandlingResult> processCommand(Command command);

The returned supplier allows the caller to wait for the result of the handling of a Command (Commands are queued and
`processCommand` is non-blocking so after the call, the Command is likely not yet handled).

Below example shows how to create a product and wait for the result of the operation.

    CommandHandlingResult result = commandProcessor.processCommand(new CreateProduct(productKey)).get(Duration.ofSeconds(10));
    if (result.isSuccess()) {
        // Handle creation success
    } else {
        // Handle creation failure
    }

The `get` method of the `BlockingSupplier` instance takes as argument the maximum duration to wait before actually
returning the result. An exception is thrown if no result is available after that duration.

## Run your Meta-Application

A running Pousse-Café Meta-Application is represented by a *Meta-Application Context* (or *Context*). The Context
instantiates all required services and injects them when necessary. It also gives access to Aggregates via their related
Repository and Factory. Finally, it provides the `CommandProcessor` instance that can be used to submit Commands to the
Meta-Application.

In order to instantiate a Meta-Application Context, a *Meta-Application Configuration* is required. This is represented
by a `MetaApplicationConfiguration` instance. A `MetaApplicationConfiguration` describes the Workflows, Domain Services
and Aggregates composing the Meta-Application. Below example shows a `MetaApplicationConfiguration` sub-class which
describes a Meta-Application composed of an Aggregate, a Domain Service and a Workflow:

    public abstract class MyAppConfiguration extends MetaApplicationConfiguration {
    
        public void registerComponents() {
            registerAggregate(productConfiguration());
            registerService(new ContentChooser());
            registerWorkflow(new ProductManagement());
        }
    
        protected abstract ProductConfiguration productConfiguration();
    }

The Aggregate is configured using an instance of `ProductConfiguration` which is defined as follows:

    public class ProductConfiguration
        extends AggregateConfiguration<ProductKey, Product, Data, ProductFactory, ProductRepository> {
    
        public ProductConfiguration() {
            super(Product.class, ProductFactory.class, ProductRepository.class);
        }
    }

The purpose of an `AggregateConfiguration<K, A, D, F, R>` sub-class is to link together the different elements defining
an Aggregate in Pousse-Café i.e. its key (`K`), the class describing it (`A`), the class describing the Aggregate's data
(`D`), the Aggregate's Factory (`F`) and its Repository (`R`).

Above `MyAppConfiguration` class is abstract to leave the responsibility of instantiating the Aggregate Configuration
to a sub-class that is aware of the storage technology to use. Below an example of `ProductConfiguration` sub-class
actually using an in-memory storage and the sub-class of `MyAppConfiguration` actually using it:

    public class InMemoryProductConfiguration extends ProductConfiguration {
        public InMemoryProductConfiguration() {
            setDataFactory(new InMemoryDataFactory<>(Product.Data.class));
            setDataAccess(new InMemoryDataAccess<>(Product.Data.class));
        }
    }

    public class MyRealAppConfiguration extends MyAppConfiguration {
        protected ProductConfiguration productConfiguration() {
            return new InMemoryProductConfiguration();
        }
    }

The constructor of `InMemoryProductConfiguration` class shows how to choose the adapters linking an Aggregate to a storage
technology. The methods called have the following definition:

    void setDataFactory(StorableDataFactory<D> aggregateDataFactory);
    void setDataAccess(StorableDataAccess<K, D> dataAccess);

A `StorableDataFactory<D>` instance, with `D` extending `AggregateData<K>` (`K` being the Aggregate's key) describes
the factory instantiating the storage-specific data of an Aggregate. The `StorableDataAccess<K, D>` implementation
describes how data are actually retrieved. In above example, `InMemoryDataFactory` and `InMemoryDataAccess` are generic
in-memory storage implementations provided by Pousse-Café. The interesting feature here is that they do not require an
actual implementation of the data interface, a default implementation is built based on the interface's methods. This
is interesting for testing purposes among other things.

A Meta-Application Context for above sample configuration can be created as follows:

    MetaApplicationContext context = new MetaApplicationContext(new MyRealAppConfiguration());

You can then start submitting commands using the Command Processor and retrieve Aggregates using their Repository. Below
snippet shows how to create a Product Aggregate and access it via its Repository:

    ProductKey productKey = new ProductKey("product-1");
    CommandHandlingResult result = context.getCommandProcessor().processCommand(new CreateProduct(productKey)).get(Duration.ofSeconds(10));
    if (result.isSuccess()) {
        return context.getStorableServices(Product.class).getRepository().get(productKey);
    } else {
        throw new Exception("Unable to create Product");
    }

## Test your Meta-Application

Pousse-Café provides some tools allowing to easily test your Meta-Application independently of the storage
technology (you will need to add a dependency to the Test module to have access to them).
This means that you might actually write your whole Domain logic even before deciding what kind of
storage you will be using. More importantly, it means that you can focus your tests on the Domain.

Pousse-Café provides a `MetaApplicationTest` which can be extended to write (JUnit 4) tests involving parts of the
Meta-Application. What this class does is essentially instantiating a Meta-Application Context with all registered
Aggregates being configured to use the default in-memory storage. Once the Context has been created, you can submit
Commands and test the result of their execution. Below example shows a test verifying that the submission of the
`CreateProduct` Command actually ends in the creation of it.

    public class ProductManagementTest extends MetaApplicationTest {
    
        @Override
        protected void registerComponents() {
            configuration.registerAggregate(new TestConfigurationBuilder()
                    .withConfiguration(new ProductConfiguration())
                    .withData(Product.Data.class)
                    .build());
    
            configuration.registerWorkflow(new ProductManagement());
        }
    
        @Test
        public void productCanBeCreated() {
            ProductKey productKey = new ProductKey("product-id");
            processAndAssertSuccess(new CreateProduct(productKey));
            assertThat(find(Product.class, productKey), notNullValue());
        }
    }

The `configuration` field is the test Meta-Application Configuration ready to be configured before unit tests are
actually executed. The `TestConfigurationBuilder` is a helper class configuring the provided Aggregate configuration to
use the default in-memory data factory and access implementations. `processAndAssertSuccess` is a method submitting a
Command to the test Meta-Application Context and waits for the handling's result. If the handling was not successful, 
an assertion failure occurs. Finally, `find` method is a shortcut actually retrieving the Repository linked to given
Aggregate and calling the `find` method of the Repository with given key.
