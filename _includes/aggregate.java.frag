public class Product extends AggregateRoot&lt;ProductKey, ProductData&gt; {

    public void placeOrder(OrderDescription description) {
        int unitsAvailable = getData().getAvailableUnits();
        if (description.units > unitsAvailable) {
            addDomainEvent(new OrderRejected(getKey(), description));
        } else {
            getData().setAvailableUnits(unitsAvailable - description.units);
            addDomainEvent(new OrderPlaced(getKey(), description));
        }
    }

    public static interface Data extends AggregateData&lt;ProductKey&gt; {

        void setAvailableUnits(int units);

        int getAvailableUnits();
    }
}