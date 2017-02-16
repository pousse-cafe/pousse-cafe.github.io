public class Product extends AggregateRoot&lt;ProductKey, ProductData&gt; {

    public void placeOrder(OrderDescription description) {
        int unitsAvailable = getData().getAvailableUnits();
        checkThat(value(description.units).verifies(lessThan(unitsAvailable).or(equalTo(unitsAvailable))).because(
                "Cannot order more than available: " + unitsAvailable + " available, " + description.units
                + " ordered"));

        getData().setAvailableUnits(unitsAvailable - description.units);

        addDomainEvent(new OrderPlaced(getData().getKey(), description));
    }

    public static interface Data extends AggregateData&lt;ProductKey&gt; {

        void setAvailableUnits(int units);

        int getAvailableUnits();
    }
}