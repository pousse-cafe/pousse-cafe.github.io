---
layout: page
title: Extended Messaging Intermediate Language (EMIL)
permalink: /doc/emil/
---

## Introduction

The [original MIL](https://github.com/jelster/CqrsMessagingTools/wiki/MIL-Walkthrough) cannot be used directly
because Pousse-Café:

- does not have explicit command handlers: factories, repositories and runners act as such but also consume events;
- allows direct handling of commands by Aggregates;
- uses named message listeners which are not represented in MIL;
- needs information about the required or optional nature of the issuance of an event or the creation of an aggregate.

In addition to above items, it is desirable that complex processing chains can be represented in a structured way in order to enable a quick overview of the process as a whole. Therefore, it should be possible to represent the fact that an event is consumed by an aggregate root and in turn triggers the issuance of another which is itself consumed by a factory in order create a new aggregate etc. Unfortunately, MIL, while not preventing this explicitly, does not enable it in an unambiguous way unless you take indentation as a way of detecting the nesting of events issuance.

Therefore, an extension of MIL called EMIL (Extended MIL) and which takes PC's specificity into account as well as a need to represent complex processes in a structured way is proposed.

## Aggregate update

Below is a first example of EMIL.

```
process InvoiceManagement

SendCustomerInvoice? -> Ru{SendRunner}
    @Invoice[send]:
        :CustomerInvoiceSent! -> . [Communication]
        :InvoiceAged! ->
            @InvoiceStatistics[update]
            :.
```

`process X` statement tells the name of the process being described. If there is not focus on a particular process, `*` can be used instead (i.e. all processes are described). In the following, EMIL snippets will be shown so this statement will be ignored. It is however mandatory in full EMIL descriptions.

`X{...}` is an operator used to qualify a name. In above example, the `Ru` prefix tells that `SendRunner` is a runner. The other supported prefixes are `Re` for repositories, `F` for factories and `P` for processes (see examples below).

The `[...]` operator is added in order to enrich MIL with notes. The semantics behind notes depend on the context (see below for more details).

`@Invoice[send]` represents message listener `send` of Invoice's aggregate root. As there is a single message listener per message per aggregate root, this information could actually be optional, but it is useful to tell how the aggregate's state is altered by the consumption of the message if the message listener name is "intention revealing" enough.

The `[...]` after ` -> .` expression tells the `consumedByExternals` list of `ProducesEvent` annotation.

It is interesting to note that `@InvoiceStatistics[update]` replaces somehow the `*` operator in the original MIL by actually describing a state change.

The `:.` token represents the end of a list of issued events.

## Aggregate creation

Next is an example of aggregate creation described with EMIL:

```
CreateInvoice? -> F{InvoiceFactory}[createNew]
    @Invoice[onAdd]:
        :InvoiceCreated! -> . [CommunicationSystem]
        :.
```

As explicited above, the `ProducesEvent` annotation is on aggregate root's `onAdd` method.

Above aggregate creations is "required" i.e. it will unconditionally be executed. However, there are cases where creation is optional (e.g. if the aggregate already exists). For this purpose, cardinality operators are introduced. `#` tells that a creation is optional (i.e. the set of created aggregates contains one or no elements). At the same time, there are situations where several aggregates may be created. The operator `+` tells that 0 to N instances of an aggregate may be created.

Below two examples, one for optional aggregate creation and one for multiple aggregates creation:

```
[AccountSystem] NewReceivableRegistered! -> F{InvoiceFactory}[createIfNotAlreadyPresent]#
```

```
[AccountSystem] NewReceivablesRegistered! -> F{InvoiceFactory}[createMissing]+
```

## Aggregate deletion

Below is an example of aggregate deletion described with EMIL. In above examples, all event issuances are "required". However, there are cases where issuance is optional. For this purpose, the `#` operator may also be used:

```
DeleteInvoice? -> Re{InvoiceRepository}[removeIfExists]
    @Invoice[onDelete]:
        :InvoiceDeleted!# -> . [CommunicationSystem]
        :.
```

As explicited above, the `ProducesEvent` annotation is on aggregate root's `onDelete` method.

## Reference external systems

In PC, a process may be triggered by an event coming from an external sub-system. In that case, a note can be used to name the origin of the event as shown below:

```
ReceivableOverdue! [AccountingSystem] -> Ru{MarkOverdueRunner}
    @Invoice[markOverdue]:
        :InvoiceMarkedOverdue! -> . [CommunicationSystem]
            :.
```

The note after the top event being consumed gives the value of `consumesFromExternal` attribute of `MessageListener` annotation.

## Reference other processes

It may happen that, when focusing on a given process, a message is actually handled by another process. But as the focus is set on the given process, its consumption is not explicitly represented. Instead, the other process is represented as a component which consumes a message e.g.

```
CancelInvoice! -> Ru{CancelRunner}
    @Invoice[cancel]:
        :InvoiceCancelled! -> P{CustomerManagement}
            :.
```

In above example, `CustomerManagement` is another process of the domain (i.e. not an external system) which contains at least one listener consuming event `InvoiceCancelled`.

## Convert EMIL to MIL

As EMIL is only an extension of MIL, it is easy to come back on an original MIL syntax by applying the following string transformations:
- Replace occurrences of `X{...}` by `...`
- Replace occurrences of `[...]` by an empty string
- Replace occurrences of `#` by an empty string
- Replace occurrences of `+` by an empty string

## Grammar

The latest grammar of EMIL is available
[here](https://github.com/pousse-cafe/pousse-cafe/blob/master/pousse-cafe-source/src/main/antlr4/poussecafe/source/emil/parser/Emil.g4).
It is written in the form of an ANTLR4 grammar, see [ANTLR documentation](https://github.com/antlr/antlr4/blob/master/doc/index.md)
to learn the syntax (which is rather similar to [EBNF](https://en.wikipedia.org/wiki/Extended_Backus%E2%80%93Naur_form)).
