...

/**
 * Component processing commands defined by Domain logic
 */
@Autowired
private CommandProcessor commandProcessor;

/**
 * Product DDD Repository
 */
@Autowired
private ProductRepository productRepository;

/**
 * A converter generating a Product view
 */
@Autowired
private ProductConverter productConverter;

...

/**
 * JAX-RS annotated method implemeting the creation of a new Product
 */
@POST
@Path("product")
@Consumes(MediaType.APPLICATION_JSON_VALUE)
@Produces(MediaType.APPLICATION_JSON_VALUE)
public void createProduct(CreateProductView input, @Suspended final AsyncResponse asyncResponse) {
    ProductKey productKey = new ProductKey(input.key);
    // Below statement submits a Product creation command and waits (max. 10 seconds) for the end of its execution
    CommandHandlingResult result = commandProcessor.processCommand(new CreateProduct(productKey)).get(Duration.ofSeconds(10));
    if (result.isSuccess()) {
        // A product view is returned
        asyncResponse.resume(productConverter.convert(productRepository.get(productKey)));
    } else {
        // An error is returned
        asyncResponse.resume(new RuntimeException("Unable to create product: " + result.getFailureDescription()));
    }
}

...