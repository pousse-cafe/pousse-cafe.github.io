public class ProductManagementWorkflow extends Workflow {

    private ProductFactory productFactory;
    
    private ProductRepository productRepository;
    
    @CommandListener
    public void createProduct(CreateProduct command) {
        Product product = productFactory.buildProductWithNoStock(command.getProductKey());
        runInTransaction(() -> productRepository.add(product));
    }
}