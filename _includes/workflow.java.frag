...

/**
 * Product DDD Factory
 */
private ProductFactory productFactory;

/**
 * Product DDD Repository
 */
private ProductRepository productRepository;

...

@CommandListener
public void createProduct(CreateProduct command) {
    Product product = productFactory.buildProductWithNoStock(command.getProductKey());
    runInTransaction(() -> productRepository.add(product));
}

...