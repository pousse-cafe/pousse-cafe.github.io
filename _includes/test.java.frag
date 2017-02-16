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
