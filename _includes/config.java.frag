public class SampleMetaAppBundle extends MetaApplicationBundle {

    @Override
    protected void loadDefinitions(Set&lt;StorableDefinition&gt; definitions) {
        definitions.add(new StorableDefinition.Builder()
                .withStorableClass(Product.class)
                .withFactoryClass(ProductFactory.class)
                .withRepositoryClass(ProductRepository.class)
                .build());
    }

    @Override
    protected void loadImplementations(Set&lt;StorableImplementation&gt; implementations) {
        implementations.add(new StorableImplementation.Builder()
                .withStorableClass(Product.class)
                .withDataFactory(ProductData::new)
                .withDataAccessFactory(ProductDataAccess::new)
                .withStorage(InMemoryStorage.instance())
                .build());
    }

    @Override
    protected void loadProcesses(Set&lt;Class&lt;? extends DomainProcess&gt;&gt; processes) {
        processes.add(ProductManagement.class);
    }

    @Override
    protected void loadServices(Set&lt;Class&lt;?&gt;&gt; services) {

    }

}
