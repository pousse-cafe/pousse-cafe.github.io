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
