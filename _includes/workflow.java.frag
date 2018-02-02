public class ProductManagement extends DomainProcess {

    private ProductFactory productFactory;

    private ProductRepository productRepository;

    public void createProduct(CreateProduct command) {
        Product product = productFactory.buildProductWithNoStock(command.getProductKey());
        runInTransaction(Product.class, () -> productRepository.add(product));
    }
}
