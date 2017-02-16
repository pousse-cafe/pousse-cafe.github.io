public abstract class MyMetaAppConfiguration extends MetaApplicationConfiguration {

    public MyMetaAppConfiguration() {
        registerAggregate(productConfiguration());
        registerWorkflow(new ProductManagementWorkflow());
    }

    protected abstract ProductConfiguration productConfiguration();
}
