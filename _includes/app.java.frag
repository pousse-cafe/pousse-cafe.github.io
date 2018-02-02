@RestController
public class RestResource {

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private ProductManagement productManagement;

    @RequestMapping(path = "/product", method = RequestMethod.POST)
    public void createProduct(@RequestBody CreateProductView input) {
        ProductKey productKey = new ProductKey(input.key);
        productManagement.createProduct(new CreateProduct(productKey));
    }
}
