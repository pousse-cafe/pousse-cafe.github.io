@Path("/")
public class RestResource {

    @Autowired
    private CommandProcessor commandProcessor;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private ProductConverter productConverter;

    @POST
    @Path("product")
    @Consumes(MediaType.APPLICATION_JSON_VALUE)
    @Produces(MediaType.APPLICATION_JSON_VALUE)
    public void createProduct(CreateProductView input,
            @Suspended final AsyncResponse asyncResponse) {
        ProductKey productKey = new ProductKey(input.key);
        CommandHandlingResult result = commandProcessor.processCommand(new CreateProduct(productKey)).get(Duration.ofSeconds(10));
        if (result.isSuccess()) {
            asyncResponse.resume(productConverter.convert(productRepository.get(productKey)));
        } else {
            asyncResponse.resume(new RuntimeException("Unable to create product: " + result.getFailureDescription()));
        }
    }
}
