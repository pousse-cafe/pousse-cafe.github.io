...

@Test
public void placingOrderCreatesOrder() {
    givenContext(); // Initializes testing runtime
    givenAvailableProduct();
    whenPlacingOrder();
    thenOrderCreated();
}

private void givenAvailableProduct() {
    productKey = new ProductKey("product-1");
    processAndAssertSuccess(new CreateProduct(productKey));
    processAndAssertSuccess(new AddUnits(productKey, 10));
}

private void whenPlacingOrder() {
    description = new OrderDescription();
    description.reference = "ref";
    description.units = 1;
    processAndAssertSuccess(new PlaceOrder(productKey, description));
}

private void thenOrderCreated() {
    OrderKey orderKey = new OrderKey(productKey, description.reference);
    Order order = getEventually(Order.class, orderKey);
    assertThat(order, notNullValue());
}

...